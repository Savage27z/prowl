// Analyst Agent — pattern recognition and cross-case correlation
// Agent 2: Analyst
// Matches patterns against memory of past cases and known scam signatures
// Reads Tracer's findings, writes analysis back to Sibyl Memory

import { getSibylMemory } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';
import type { Hop, Pattern, Analysis, MemoryDirective } from '@/memory/schemas';
import { ChainReader, isKnownAddress } from '@/chain/reader';
import { callAI } from '@/agents/ai';

const chain = new ChainReader();

interface AnalysisResult {
  analyses: Analysis[];
  newPatterns: Pattern[];
  overallRisk: 'high' | 'medium' | 'low';
  summary: string;
  memoryDegraded?: boolean;
}

export class AnalystAgent {
  private memory = getSibylMemory();

  // Analyze all hops for a case
  async analyzeCase(caseId: string): Promise<AnalysisResult> {
    // Read Tracer's hop data from Sibyl Memory (L55 — referenced in README)
    const hops = await this.memory.query<Hop>(COLLECTIONS.HOPS, {
      filter: { case_id: caseId },
      sort: { field: 'hop_number', order: 'asc' },
    });

    if (hops.length === 0) {
      return {
        analyses: [],
        newPatterns: [],
        overallRisk: 'low',
        summary: 'No hop data available. Waiting for Tracer to write findings.',
      };
    }

    // Load existing patterns from memory
    const knownPatterns = await this.memory.query<Pattern>(COLLECTIONS.PATTERNS, {});
    // Load past analyses for cross-case correlation
    const pastAnalyses = await this.memory.query<Analysis>(COLLECTIONS.ANALYSIS, {});

    // ⚠ DEGRADATION CHECK — memory deletion test
    // If pattern database is empty, agents lose cross-case intelligence
    const memoryDegraded = knownPatterns.length === 0 && pastAnalyses.length === 0;

    // Analyze each hop
    const analyses: Analysis[] = [];
    const newPatterns: Pattern[] = [];

    // Detect patterns across all hops
    const detectedPatterns = await this.detectPatterns(hops, knownPatterns);
    newPatterns.push(...detectedPatterns);

    for (const hop of hops) {
      const analysis = await this.analyzeHop(
        caseId,
        hop,
        knownPatterns,
        pastAnalyses,
        detectedPatterns
      );
      analyses.push(analysis);

      // Write analysis to Sibyl Memory (L78 — referenced in README)
      const analysisId = `${caseId}-analysis-${hop.hop_number}-${hop.branch_id}`;
      await this.memory.store(
        COLLECTIONS.ANALYSIS,
        analysis as unknown as Record<string, unknown>,
        analysisId
      );
    }

    // Write new patterns to memory
    for (const pattern of newPatterns) {
      await this.memory.store(
        COLLECTIONS.PATTERNS,
        pattern as unknown as Record<string, unknown>,
        pattern.pattern_id
      );
    }

    // Calculate overall risk
    const overallRisk = this.calculateOverallRisk(analyses);

    // Generate AI summary
    let summary = await this.generateAnalysisSummary(caseId, hops, analyses, newPatterns);

    // Append degradation warnings if memory was empty
    if (memoryDegraded) {
      summary = `⚠ MEMORY DEGRADED — No pattern database found. Analyst is operating blind: no cross-case correlation, no known scam signatures, no historical intelligence. Every investigation starts from zero. Restore Sibyl Memory to enable pattern matching.\n\n${summary}`;
    }

    return { analyses, newPatterns, overallRisk, summary, memoryDegraded };
  }

  // Analyze a single hop
  private async analyzeHop(
    caseId: string,
    hop: Hop,
    knownPatterns: Pattern[],
    pastAnalyses: Analysis[],
    detectedPatterns: Pattern[]
  ): Promise<Analysis> {
    const patternMatches: string[] = [];
    const similarCases: string[] = [];
    let riskLevel: 'high' | 'medium' | 'low' = 'low';
    const notes: string[] = [];

    // Check against known patterns
    for (const pattern of knownPatterns) {
      if (this.matchesPattern(hop, pattern)) {
        patternMatches.push(pattern.pattern_id);
        notes.push(`Matches known pattern: ${pattern.description}`);

        // Increment pattern match count
        await this.memory.update(COLLECTIONS.PATTERNS, pattern.pattern_id, {
          times_matched: pattern.times_matched + 1,
        });
      }
    }

    // Check against new detected patterns
    for (const pattern of detectedPatterns) {
      if (this.matchesPattern(hop, pattern)) {
        patternMatches.push(pattern.pattern_id);
      }
    }

    // Cross-reference with past analyses (similar addresses)
    for (const pastAnalysis of pastAnalyses) {
      if (pastAnalysis.case_id !== caseId) {
        if (pastAnalysis.address_analyzed.toLowerCase() === hop.to_address.toLowerCase()) {
          similarCases.push(pastAnalysis.case_id);
          notes.push(`Address ${hop.to_address.slice(0, 10)}... appeared in case ${pastAnalysis.case_id}`);
          riskLevel = 'high';
        }
      }
    }

    // Check if address is a contract
    const isContract = await chain.isContract(hop.to_address);
    if (isContract) {
      notes.push('Destination is a smart contract');

      // Compare bytecode with known malicious contracts
      const bytecodeHash = await chain.getBytecodeHash(hop.to_address);
      if (bytecodeHash) {
        const matchingPatterns = knownPatterns.filter(
          (p) => p.bytecode_hash === bytecodeHash
        );
        if (matchingPatterns.length > 0) {
          riskLevel = 'high';
          notes.push(`Contract bytecode matches known malicious pattern: ${matchingPatterns[0].description}`);
          patternMatches.push(...matchingPatterns.map((p) => p.pattern_id));
        }
      }
    }

    // ── AI Threat Assessment ────────────────────────────────────────
    // Let the AI model evaluate the hop context and provide a threat
    // classification that feeds into the risk score. This makes AI
    // reasoning load-bearing in the analysis, not just summary polish.
    const aiThreat = await this.aiThreatAssessment(hop, notes, patternMatches, similarCases, isContract);
    if (aiThreat.riskBoost) {
      if (aiThreat.riskBoost === 'high') riskLevel = 'high';
      else if (aiThreat.riskBoost === 'medium' && riskLevel === 'low') riskLevel = 'medium';
    }
    if (aiThreat.insight) {
      notes.push(`AI assessment: ${aiThreat.insight}`);
    }

    // Determine risk level from rule-based evidence
    if (patternMatches.length >= 3 || similarCases.length >= 2) {
      riskLevel = 'high';
    } else if (patternMatches.length >= 1 || similarCases.length >= 1) {
      if (riskLevel === 'low') riskLevel = 'medium';
    }

    if (hop.flagged && hop.flag_reason?.includes('Dead end')) {
      if (riskLevel === 'low') riskLevel = 'medium';
      notes.push('Funds sitting idle — possible laundering cooldown');
    }

    // Calculate confidence based on evidence strength
    const confidence = Math.min(
      0.99,
      0.3 +
        patternMatches.length * 0.15 +
        similarCases.length * 0.2 +
        (isContract ? 0.1 : 0) +
        (aiThreat.confidenceBoost || 0)
    );

    // Emit an explicit directive for the Tracer to consume on future cases.
    // Only a verified terminal service (CEX/bridge) earns a skip — everything
    // else stays traceable, since "low risk" means insufficient evidence.
    const known = isKnownAddress(hop.to_address);
    let directive: MemoryDirective | undefined;
    if (known.known && known.terminal) {
      directive = { action: 'skip', reason: 'verified_service', confidence: 0.98 };
    } else if (riskLevel === 'high') {
      directive = {
        action: 'prioritize',
        reason: similarCases.length > 0 ? 'cross_case_entity' : 'known_drainer',
        confidence,
      };
    } else if (patternMatches.length > 0) {
      directive = { action: 'prioritize', reason: 'laundering_pattern', confidence };
    }

    return {
      case_id: caseId,
      hop_number: hop.hop_number,
      address_analyzed: hop.to_address,
      risk_level: riskLevel,
      pattern_matches: patternMatches,
      similar_cases: similarCases,
      notes: notes.join('. ') || 'No significant patterns detected.',
      confidence,
      ...(directive ? { directive } : {}),
    };
  }

  // AI-powered threat assessment — evaluates hop context with LLM reasoning
  // This makes AI load-bearing: it can elevate risk levels and add insights
  // that the rule-based engine can't detect (unusual timing, behavioral patterns)
  private async aiThreatAssessment(
    hop: Hop,
    existingNotes: string[],
    patternMatches: string[],
    similarCases: string[],
    isContract: boolean
  ): Promise<{ riskBoost: 'high' | 'medium' | null; insight: string | null; confidenceBoost: number }> {
    try {
      const prompt = `You are a crypto forensic analyst. Evaluate this fund movement for suspicious activity.

Hop #${hop.hop_number} in case ${hop.case_id}:
- From: ${hop.from_address}
- To: ${hop.to_address}
- Amount: ${hop.amount} ETH
- Timestamp: ${hop.timestamp}
- Is split transaction: ${hop.is_split}
- Is contract: ${isContract}
- Flag: ${hop.flag_reason || 'none'}
- Pattern matches so far: ${patternMatches.length}
- Cross-case hits: ${similarCases.length}
- Current evidence: ${existingNotes.join('; ') || 'none'}

Respond with EXACTLY this JSON format (no markdown, no explanation):
{"risk":"high"|"medium"|"low","insight":"one sentence threat assessment","confidence":0.0-0.2}

Rules:
- "risk": your independent assessment — "high" for likely laundering/theft, "medium" for suspicious, "low" for benign
- "insight": one specific sentence about what you see (behavioral pattern, timing anomaly, structural red flag)
- "confidence": how much to boost the confidence score (0.0 to 0.2)`;

      const raw = await callAI(prompt, { maxTokens: 150, temperature: 0.2 });

      // Parse the AI response
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      return {
        riskBoost: parsed.risk === 'high' ? 'high' : parsed.risk === 'medium' ? 'medium' : null,
        insight: typeof parsed.insight === 'string' ? parsed.insight : null,
        confidenceBoost: typeof parsed.confidence === 'number' ? Math.min(0.2, Math.max(0, parsed.confidence)) : 0,
      };
    } catch {
      // AI unavailable — fall back silently, rule-based analysis still works
      return { riskBoost: null, insight: null, confidenceBoost: 0 };
    }
  }

  // Detect patterns across all hops in a case
  private async detectPatterns(hops: Hop[], existingPatterns: Pattern[]): Promise<Pattern[]> {
    const newPatterns: Pattern[] = [];
    const existingTypes = new Set(existingPatterns.map((p) => p.pattern_type));
    const caseId = hops[0]?.case_id || 'unknown';

    // Pattern: Fund splitting (5+ recipients within 1 hour)
    const splits = hops.filter((h) => h.is_split);
    if (splits.length >= 5) {
      const timestamps = splits.map((h) => new Date(h.timestamp).getTime());
      const timeSpan = Math.max(...timestamps) - Math.min(...timestamps);
      if (timeSpan < 3600000) {
        // 1 hour
        const patternId = `pat-${Date.now()}-split`;
        newPatterns.push({
          pattern_id: patternId,
          pattern_type: 'fund_splitting',
          description: `Funds split into ${splits.length}+ wallets within 1 hour of theft`,
          first_seen_case: caseId,
          times_matched: 1,
          confidence: 0.85,
          related_addresses: splits.map((h) => h.to_address),
          bytecode_hash: null,
        });
      }
    }

    // Pattern: Rapid movement (3+ hops within 10 minutes)
    const hopTimestamps = hops
      .filter((h) => h.timestamp)
      .map((h) => ({ hop: h, time: new Date(h.timestamp).getTime() }))
      .sort((a, b) => a.time - b.time);

    for (let i = 0; i < hopTimestamps.length - 2; i++) {
      const window = hopTimestamps.slice(i, i + 3);
      const span = window[window.length - 1].time - window[0].time;
      if (span < 600000) {
        // 10 minutes
        const patternId = `pat-${Date.now()}-rapid`;
        newPatterns.push({
          pattern_id: patternId,
          pattern_type: 'rapid_movement',
          description: `3+ hops within 10 minutes — rapid fund movement detected`,
          first_seen_case: caseId,
          times_matched: 1,
          confidence: 0.75,
          related_addresses: window.map((w) => w.hop.to_address),
          bytecode_hash: null,
        });
        break; // One pattern per type per case
      }
    }

    // Pattern: Contract interaction in the chain
    const contractHops = hops.filter((h) => h.flag_reason?.includes('Contract'));
    if (contractHops.length > 0) {
      const patternId = `pat-${Date.now()}-contract`;
      newPatterns.push({
        pattern_id: patternId,
        pattern_type: 'contract_interaction',
        description: `Funds routed through ${contractHops.length} smart contract(s)`,
        first_seen_case: caseId,
        times_matched: 1,
        confidence: 0.7,
        related_addresses: contractHops.map((h) => h.to_address),
        bytecode_hash: null,
      });
    }

    // Pattern: Bridge usage
    const bridgeHops = hops.filter((h) => h.flag_reason?.includes('Bridge'));
    if (bridgeHops.length > 0) {
      const patternId = `pat-${Date.now()}-bridge`;
      newPatterns.push({
        pattern_id: patternId,
        pattern_type: 'bridge_usage',
        description: `Funds sent to bridge contract — cross-chain movement`,
        first_seen_case: caseId,
        times_matched: 1,
        confidence: 0.9,
        related_addresses: bridgeHops.map((h) => h.to_address),
        bytecode_hash: null,
      });
    }

    return newPatterns;
  }

  private matchesPattern(hop: Hop, pattern: Pattern): boolean {
    // Check if hop address is in pattern's related addresses
    const addrLower = hop.to_address.toLowerCase();
    if (pattern.related_addresses.some((a) => a.toLowerCase() === addrLower)) {
      return true;
    }

    // Check by pattern type
    switch (pattern.pattern_type) {
      case 'fund_splitting':
        return hop.is_split;
      case 'rapid_movement':
        return false; // Needs multi-hop context
      case 'contract_interaction':
        return hop.flag_reason?.includes('Contract') || false;
      case 'bridge_usage':
        return hop.flag_reason?.includes('Bridge') || false;
      default:
        return false;
    }
  }

  private calculateOverallRisk(analyses: Analysis[]): 'high' | 'medium' | 'low' {
    const highCount = analyses.filter((a) => a.risk_level === 'high').length;
    const medCount = analyses.filter((a) => a.risk_level === 'medium').length;

    if (highCount >= 2 || (highCount >= 1 && medCount >= 2)) return 'high';
    if (highCount >= 1 || medCount >= 2) return 'medium';
    return 'low';
  }

  private async generateAnalysisSummary(
    caseId: string,
    hops: Hop[],
    analyses: Analysis[],
    newPatterns: Pattern[]
  ): Promise<string> {
    const highRisk = analyses.filter((a) => a.risk_level === 'high');
    const allNotes = analyses.map((a) => a.notes).filter((n) => n !== 'No significant patterns detected.');

    const prompt = `You are a crypto forensic analyst. Summarize this investigation analysis for case ${caseId}:

Total hops analyzed: ${hops.length}
High risk addresses: ${highRisk.length}
New patterns discovered: ${newPatterns.length}
Cross-case matches: ${analyses.filter((a) => a.similar_cases.length > 0).length}

Key findings:
${allNotes.join('\n')}

New patterns:
${newPatterns.map((p) => `- ${p.description} (confidence: ${p.confidence})`).join('\n') || 'None'}

Provide a concise 3-4 sentence analysis summary with risk assessment and recommendations.`;

    return callAI(prompt);
  }
}

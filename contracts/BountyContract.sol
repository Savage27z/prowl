// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ProwlBounty — Onchain bounty escrow for crypto theft investigations
/// @notice Post bounties, lock rewards, agents claim and submit reports
/// @dev Deployed on Base (L2)

contract ProwlBounty {
    enum Status { Open, Claimed, Submitted, Approved, Disputed, Expired }

    struct Bounty {
        address poster;
        address walletAddress;        // Victim's wallet
        bytes32 incidentTxHash;       // Transaction hash of the theft
        string description;
        uint256 reward;
        address claimedBy;
        bytes32 reportHash;           // IPFS hash or onchain hash of investigation report
        Status status;
        uint256 createdAt;
        uint256 claimedAt;
        uint256 submittedAt;
    }

    uint256 public bountyCount;
    uint256 public openBountyCount;
    uint256 public constant MIN_STAKE = 0.001 ether;
    uint256 public constant TIMEOUT_PERIOD = 7 days;
    uint256 public constant PROTOCOL_FEE_BPS = 500;  // 5% fee in basis points
    address public immutable treasury;                 // Protocol treasury
    uint256 public totalFeesCollected;                 // Cumulative protocol revenue

    /// @dev Simple reentrancy lock
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "Reentrant call");
        _locked = 2;
        _;
        _locked = 1;
    }

    mapping(uint256 => Bounty) public bounties;
    mapping(address => uint256) public agentStakes;

    // Events
    event BountyPosted(uint256 indexed bountyId, address indexed poster, uint256 reward);
    event BountyClaimed(uint256 indexed bountyId, address indexed agent);
    event ReportSubmitted(uint256 indexed bountyId, bytes32 reportHash);
    event PayoutReleased(uint256 indexed bountyId, address indexed agent, uint256 amount);
    event ProtocolFeeCollected(uint256 indexed bountyId, uint256 fee);
    event BountyDisputed(uint256 indexed bountyId);
    event BountyExpired(uint256 indexed bountyId);

    constructor(address _treasury) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    /// @notice Post a new bounty with ETH reward locked in escrow
    /// @param walletAddress The victim's wallet address to investigate
    /// @param incidentTxHash The transaction hash of the theft incident
    /// @param description Human-readable description of the theft
    function postBounty(
        address walletAddress,
        bytes32 incidentTxHash,
        string calldata description
    ) external payable returns (uint256 bountyId) {
        require(msg.value > 0, "Reward must be > 0");
        require(walletAddress != address(0), "Invalid wallet address");
        require(incidentTxHash != bytes32(0), "Invalid tx hash");

        bountyId = bountyCount++;
        openBountyCount++;

        bounties[bountyId] = Bounty({
            poster: msg.sender,
            walletAddress: walletAddress,
            incidentTxHash: incidentTxHash,
            description: description,
            reward: msg.value,
            claimedBy: address(0),
            reportHash: bytes32(0),
            status: Status.Open,
            createdAt: block.timestamp,
            claimedAt: 0,
            submittedAt: 0
        });

        emit BountyPosted(bountyId, msg.sender, msg.value);
    }

    /// @notice Agent claims a bounty to start investigating
    /// @dev Requires a minimum stake to prevent spam
    function claimBounty(uint256 bountyId) external payable {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == Status.Open, "Bounty not open");
        require(msg.value >= MIN_STAKE, "Insufficient stake");
        require(msg.sender != bounty.poster, "Poster cannot claim own bounty");

        bounty.claimedBy = msg.sender;
        bounty.status = Status.Claimed;
        bounty.claimedAt = block.timestamp;
        agentStakes[msg.sender] += msg.value;
        openBountyCount--;

        emit BountyClaimed(bountyId, msg.sender);
    }

    /// @notice Agent submits investigation report
    /// @param bountyId The bounty being reported on
    /// @param reportHash Hash of the investigation report (IPFS or onchain)
    function submitReport(uint256 bountyId, bytes32 reportHash) external {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == Status.Claimed, "Bounty not claimed");
        require(msg.sender == bounty.claimedBy, "Only claimer can submit");
        require(reportHash != bytes32(0), "Invalid report hash");

        bounty.reportHash = reportHash;
        bounty.status = Status.Submitted;
        bounty.submittedAt = block.timestamp;

        emit ReportSubmitted(bountyId, reportHash);
    }

    /// @notice Bounty poster approves the report and releases reward
    /// @dev Deducts 5% protocol fee from reward, sends remainder + stake to agent
    function approvePayout(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == Status.Submitted, "Report not submitted");
        require(msg.sender == bounty.poster, "Only poster can approve");

        bounty.status = Status.Approved;
        uint256 reward = bounty.reward;
        address agent = bounty.claimedBy;
        uint256 stake = agentStakes[agent];

        // Calculate protocol fee (5% of reward)
        uint256 fee = (reward * PROTOCOL_FEE_BPS) / 10000;
        uint256 agentReward = reward - fee;

        // Effects before interaction (checks-effects-interactions)
        agentStakes[agent] = 0;
        totalFeesCollected += fee;
        uint256 totalPayout = agentReward + stake;

        // Interaction — pay agent
        (bool success, ) = payable(agent).call{value: totalPayout}("");
        require(success, "Payout failed");

        // Interaction — pay treasury
        if (fee > 0) {
            (bool feeSuccess, ) = payable(treasury).call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
            emit ProtocolFeeCollected(bountyId, fee);
        }

        emit PayoutReleased(bountyId, agent, agentReward);
    }

    /// @notice Bounty poster disputes the report
    function disputeReport(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == Status.Submitted, "Report not submitted");
        require(msg.sender == bounty.poster, "Only poster can dispute");

        bounty.status = Status.Disputed;
        emit BountyDisputed(bountyId);
    }

    /// @notice Auto-approve after timeout (7 days with no response from poster)
    /// @dev Same 5% protocol fee applies on timeout resolution
    function resolveTimeout(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == Status.Submitted, "Report not submitted");
        require(
            block.timestamp >= bounty.submittedAt + TIMEOUT_PERIOD,
            "Timeout not reached"
        );

        bounty.status = Status.Approved;
        uint256 reward = bounty.reward;
        address agent = bounty.claimedBy;
        uint256 stake = agentStakes[agent];

        // Calculate protocol fee
        uint256 fee = (reward * PROTOCOL_FEE_BPS) / 10000;
        uint256 agentReward = reward - fee;

        // Effects before interaction
        agentStakes[agent] = 0;
        totalFeesCollected += fee;
        uint256 totalPayout = agentReward + stake;

        // Interaction — pay agent
        (bool success, ) = payable(agent).call{value: totalPayout}("");
        require(success, "Payout failed");

        // Interaction — pay treasury
        if (fee > 0) {
            (bool feeSuccess, ) = payable(treasury).call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
            emit ProtocolFeeCollected(bountyId, fee);
        }

        emit PayoutReleased(bountyId, agent, agentReward);
    }

    /// @notice Get bounty details
    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    /// @notice Get all open bounties count (O(1) — uses tracked counter)
    function getOpenBountyCount() external view returns (uint256) {
        return openBountyCount;
    }
}

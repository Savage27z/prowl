// SPDX-License-Identifier: MIT
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
    uint256 public constant MIN_STAKE = 0.001 ether;
    uint256 public constant TIMEOUT_PERIOD = 7 days;

    mapping(uint256 => Bounty) public bounties;
    mapping(address => uint256) public agentStakes;

    // Events
    event BountyPosted(uint256 indexed bountyId, address indexed poster, uint256 reward);
    event BountyClaimed(uint256 indexed bountyId, address indexed agent);
    event ReportSubmitted(uint256 indexed bountyId, bytes32 reportHash);
    event PayoutReleased(uint256 indexed bountyId, address indexed agent, uint256 amount);
    event BountyDisputed(uint256 indexed bountyId);
    event BountyExpired(uint256 indexed bountyId);

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
    function approvePayout(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == Status.Submitted, "Report not submitted");
        require(msg.sender == bounty.poster, "Only poster can approve");

        bounty.status = Status.Approved;
        uint256 reward = bounty.reward;
        uint256 stake = agentStakes[bounty.claimedBy];

        // Return stake and pay reward
        agentStakes[bounty.claimedBy] = 0;
        uint256 totalPayout = reward + stake;

        (bool success, ) = payable(bounty.claimedBy).call{value: totalPayout}("");
        require(success, "Payout failed");

        emit PayoutReleased(bountyId, bounty.claimedBy, reward);
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
    function resolveTimeout(uint256 bountyId) external {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.status == Status.Submitted, "Report not submitted");
        require(
            block.timestamp >= bounty.submittedAt + TIMEOUT_PERIOD,
            "Timeout not reached"
        );

        bounty.status = Status.Approved;
        uint256 reward = bounty.reward;
        uint256 stake = agentStakes[bounty.claimedBy];
        agentStakes[bounty.claimedBy] = 0;
        uint256 totalPayout = reward + stake;

        (bool success, ) = payable(bounty.claimedBy).call{value: totalPayout}("");
        require(success, "Payout failed");

        emit PayoutReleased(bountyId, bounty.claimedBy, reward);
    }

    /// @notice Get bounty details
    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    /// @notice Get all open bounties count
    function getOpenBountyCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < bountyCount; i++) {
            if (bounties[i].status == Status.Open) count++;
        }
    }
}

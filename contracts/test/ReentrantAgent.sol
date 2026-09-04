// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only attacker. Poses as the investigating AGENT, which is the
///         party that actually receives ETH during settlement and therefore
///         the only realistic reentrancy vector. On receiving the payout it
///         re-enters the contract to try to be paid twice.
interface IProwlBounty {
    function claimBounty(uint256 bountyId) external payable;
    function submitReport(uint256 bountyId, bytes32 reportHash) external;
    function resolveTimeout(uint256 bountyId) external;
}

contract ReentrantAgent {
    IProwlBounty public immutable target;
    uint256 public attackId;
    bool public reentered;
    bool private arming;

    constructor(address _target) {
        target = IProwlBounty(_target);
    }

    function claim(uint256 bountyId) external payable {
        attackId = bountyId;
        target.claimBounty{value: msg.value}(bountyId);
    }

    function submit(uint256 bountyId, bytes32 reportHash) external {
        target.submitReport(bountyId, reportHash);
        arming = true;
    }

    receive() external payable {
        if (arming) {
            arming = false;
            reentered = true;
            // Re-enter a second settlement path for the same bounty. Effects
            // run before interactions, so the bounty is already Approved and
            // this must revert rather than paying out twice.
            target.resolveTimeout(attackId);
        }
    }
}

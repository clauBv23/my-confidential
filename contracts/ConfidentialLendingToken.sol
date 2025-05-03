// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

import "fhevm/lib/TFHE.sol";
import "fhevm/config/ZamaFHEVMConfig.sol";
import "fhevm-contracts/contracts/token/ERC20/extensions/ConfidentialERC20Mintable.sol";

contract ConfidentialLendingToken is SepoliaZamaFHEVMConfig, ConfidentialERC20Mintable {
    euint64 immutable ZERO;

    mapping(eaddress user => euint64 amount) private endorsements;

    constructor(
        string memory name_,
        string memory symbol_,
        uint64 initialSupply
    ) ConfidentialERC20Mintable(name_, symbol_, msg.sender) {
        mint(msg.sender, initialSupply);

        ZERO = TFHE.asEuint64(0);
        TFHE.allowThis(ZERO);
        TFHE.allow(ZERO, owner());
    }

    function mint(address, uint64 amount) public override onlyOwner {
        // override to only mint to the contract itself (all tokens assignations to users should be done via endorse)
        _unsafeMint(address(this), amount);
        _totalSupply = _totalSupply + amount;
        emit Mint(address(this), amount);
    }

    function endorse(eaddress user, euint64 newAmount) public onlyOwner {
        // function that endorse the amount to the user
        TFHE.allowThis(newAmount);
        TFHE.allow(newAmount, owner());
        endorsements[user] = newAmount;
    }

    // this function can fail if the contract has not enough total supply
    // in that case some tokens should be minted to current ctr
    function claim() public {
        // function that claim the amount from the user
        eaddress sender = TFHE.asEaddress(msg.sender);
        euint64 amount = endorsements[sender];

        // clean the endorsement
        TFHE.allow(ZERO, msg.sender);
        endorsements[sender] = ZERO;

        ebool canTransfer = TFHE.le(amount, totalSupply());
        _transfer(address(this), msg.sender, amount, canTransfer);
    }

    // ! how allow user to access its endorsements?
    //  ! Note that currently I have to do the increase operation on the lending contract because user is encrypted at this point
    function getEndorsements(eaddress user) public view returns (euint64) {
        return endorsements[user];
    }
}

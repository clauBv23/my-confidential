// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor(string memory name_, string memory symbol_, uint64 initialSupply) ERC20(name_, symbol_) {
        _mint(msg.sender, initialSupply);
    }
}

// SPDX-License-Identifier: BSD-3-Clause-Clear

pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IAavePool } from "../IAavePool.sol";

contract MyAavePool is IAavePool {
    mapping(address user => mapping(address token => uint256 balance)) private balances;

    function supply(address asset, uint256 amount, address onBehalfOf, uint16) external {
        balances[onBehalfOf][asset] += amount;
        // check transferFrom
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
    }
}

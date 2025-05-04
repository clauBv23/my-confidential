import { createInstance } from "../tasks/instance";
import { supplyTokenToLend, getSupply, getConfidentialBalance, depositToken, requestSupply, processRequest, getEndorsement, getRequest, isRequestPending, getDeposit, claimLending, withdrawFromDeposit } from "./utils";
import * as readline from 'readline';
import { ethers } from "hardhat";


const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  console.log("🚀 Starting interactive protocol...");

  // Get contracts
  const hre = await import("hardhat");

  const lendingContractFactory = await ethers.getContractFactory("ConfidentialLending");
  const lendingContractAddress = "0xE8Ee37A893f2403d3e83D8Eb22Fb4a707D1AAA5e";
  const lendingContract = await lendingContractFactory.attach(lendingContractAddress);

  const DepositFactory = await ethers.getContractFactory("Deposit");
  const depositAddress = await lendingContract.deposit();
  const depositContract = await DepositFactory.attach(depositAddress);

  const AavePoolFactory = await ethers.getContractFactory("MyAavePool");
  const aavePoolAddress = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";

  const LendingTokenFactory = await ethers.getContractFactory("ConfidentialLendingToken");
  const lendingTokenAddress = await lendingContract.confidentialLendingToken();
  const lendingTokenContract = await LendingTokenFactory.attach(lendingTokenAddress);

  const ERC20Factory = await ethers.getContractFactory("MockToken");

  const aaveTokenContract = "0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a"
  const aaveLendingTokenAddress = "0x6b8558764d3b7572136f17174cb9ab1ddc7e1259";

  const fhevm = await createInstance(hre.default);

  // data store

  // Get user's private key from env
  const privateKey = process.env.PRIVATE_KEY;

  const wallet = new ethers.Wallet(privateKey);
  console.log("Connected with address:", wallet.address);

  console.log("Useful addresses:");
  console.log("💰 Aave Pool:", aavePoolAddress);
  console.log("💰 Lending Token:", lendingTokenAddress);
  console.log("💰 Deposit:", depositAddress);
  console.log("💰 Lending Contract:", lendingContractAddress);
  console.log("💰 Aave Token:", aaveTokenContract);
  console.log("💰 Aave Lending Token:", aaveLendingTokenAddress);

  while (true) {
    console.log("\n📋 Available operations:");
    console.log("1. Check token balance of");
    console.log("2. Deposit tokens");
    console.log("3. Supply tokens to lending");
    console.log("4. Request supply");
    console.log("5. Process request");
    console.log("6. Check endorsement");
    console.log("7. Check pending request");
    console.log("8. Check if request is pending");
    console.log("9. Check deposited amount");
    console.log("10. Check supply to lend amount");
    console.log("11. Claim lending");
    console.log("12. Withdraw from Deposit");

    const choice = await new Promise<string>((resolve) => {
      rl.question("\nSelect operation (1-12): ", (answer) => {
        resolve(answer);
      });
    });

    switch (choice) {
      case "1": // Check token balance of
        console.log("💰 Checking token balance of");
        try {
          // get token address
          const tokenAddress = await new Promise<string>((resolve) => {
            rl.question("Enter token address: ", (answer) => {
              resolve(answer);
            });
          });
          // get user address
          const userAddress = await new Promise<string>((resolve) => {
            rl.question("Enter user address: ", (answer) => {
              resolve(answer);
            });
          });
          // get is confidential
          const isConfidential = await new Promise<boolean>((resolve) => {
            rl.question("Is the token confidential? (y/n): ", (answer) => {
              resolve(answer === "y");
            });
          });

          let balance;
          if (isConfidential) {
            const tokenContract = await ERC20Factory.attach(tokenAddress);
            balance = await getConfidentialBalance(tokenContract, userAddress, fhevm, wallet);
          } else {
            const tokenContract = await ERC20Factory.attach(tokenAddress);
            balance = await tokenContract.balanceOf(userAddress);
          }
          console.log(`💰 Balance: ${balance}`);
        } catch (error) {
          console.error("Error checking balance:", error);
        }
        break;

      case "2": // deposit tokens
        console.log("💰 Depositing tokens");
        try {
          // get deposit token address
          const depositTokenAddress = await new Promise<string>((resolve) => {
            rl.question("Enter deposit token address: ", (answer) => {
              resolve(answer);
            });
          });
          // get deposit amount
          const depositAmount = await new Promise<number>((resolve) => {
            rl.question("Enter deposit amount: ", (answer) => {
              resolve(Number(answer));
            });
          });
          const tokenContract = await ERC20Factory.attach(depositTokenAddress);
          const receiptDeposit = await depositToken(depositContract, tokenContract, depositAmount);
          console.log("💰 Deposit successful", receiptDeposit.hash);
        } catch (error) {
          console.error("Error during deposit:", error);
        }
        break;

      case "3": // supply tokens to lending
        console.log("💰 Supplying tokens to lend");
        try {
          // get token address
          const tokenSupplyAddress = await new Promise<string>((resolve) => {
            rl.question("Enter token supply address: ", (answer) => {
              resolve(answer);
            });
          });
          // get supply amount
          const supplyAmount = await new Promise<number>((resolve) => {
            rl.question("Enter supply amount: ", (answer) => {
              resolve(Number(answer));
            });
          });

          const receiptSupply = await supplyTokenToLend(depositContract, tokenSupplyAddress, supplyAmount, fhevm, wallet.address);
          console.log("💰 Supply successful", receiptSupply.hash);
        } catch (error) {
          console.error("Error during supply:", error);
        }
        break;

      case "4": // request supply
        console.log("💰 Requesting supply");
        try {
          // get token address
          const tokenAddress = await new Promise<string>((resolve) => {
            rl.question("Enter token address: ", (answer) => {
              resolve(answer);
            });
          });
          // get supply amount
          const supplyAmount = await new Promise<number>((resolve) => {
            rl.question("Enter supply amount: ", (answer) => {
              resolve(Number(answer));
            });
          });

          const tokenContract = await ERC20Factory.attach(tokenAddress);
          const receiptSupply = await requestSupply(lendingContract, tokenContract, supplyAmount, fhevm, wallet.address);
          console.log("💰 Supply requested successfully", receiptSupply.hash);
        } catch (error) {
          console.error("Error during supply:", error);
        }
        break;

      case "5": // process request
        console.log("💰 Processing request");
        try {
          // get request id
          const requestId = await new Promise<string>((resolve) => {
            rl.question("Enter request id handle: ", (answer) => {
              resolve(answer);
            });
          });

          const receiptProcess = await processRequest(lendingContract, requestId);
          console.log("💰 Request processed successfully", receiptProcess.hash);
        } catch (error) {
          console.error("Error during process:", error);
        }
        break;

      case "6": // check endorsement
        console.log("💰 Checking endorsement");
        try {

          // get user address handle
          const userHandle = await new Promise<string>((resolve) => {
            rl.question("Enter user address handle: ", (answer) => {
              resolve(answer);
            });
          });


          const endorsement = await getEndorsement(lendingTokenContract, userHandle, fhevm, wallet);
          console.log("💰 Endorsement:", endorsement);
        } catch (error) {
          console.error("Error during endorsement:", error);
        }
        break;

      case "7": // check request
        console.log("💰 Checking request");
        try {
          // get request id handle
          const requestIDHandle = await new Promise<string>((resolve) => {
            rl.question("Enter request id handle: ", (answer) => {
              resolve(answer);
            });
          });
          const request = await getRequest(lendingContract, requestIDHandle, fhevm, wallet);
          console.log("💰 Request:", request);
        } catch (error) {
          console.error("Error during request:", error);
        }
        break;

      case "8": // check if request is pending
        console.log("💰 Checking if request is pending");
        try {
          // get request id handle
          const requestIDHandle = await new Promise<string>((resolve) => {
            rl.question("Enter request id handle: ", (answer) => {
              resolve(answer);
            });
          });
          const isPending = await isRequestPending(lendingContract, requestIDHandle);
          console.log("💰 Pending request:", isPending);
        } catch (error) {
          console.error("Error during pending request:", error);
        }
        break;

      case "9": // check deposited amount
        try {
          console.log("💰 Checking deposited amount");
          // get token address
          const tokenAddress = await new Promise<string>((resolve) => {
            rl.question("Enter token address: ", (answer) => {
              resolve(answer);
            });
          });
          // get user address handle
          const userHandle = await new Promise<string>((resolve) => {
            rl.question("Enter user address handle: ", (answer) => {
              resolve(answer);
            });
          });
          const depositedAmount = await getDeposit(depositContract, userHandle, tokenAddress, fhevm, wallet);
          console.log("💰 Deposited amount:", depositedAmount);
        } catch (error) {
          console.error("Error during deposited amount:", error);
        }
        break;

      case "10": // check supply to lend amount
        console.log("💰 Checking supply to lend amount");
        try {
          // get token address
          const tokenAddress = await new Promise<string>((resolve) => {
            rl.question("Enter token address: ", (answer) => {
              resolve(answer);
            });
          });
          // get user address handle
          const userHandle = await new Promise<string>((resolve) => {
            rl.question("Enter user address handle: ", (answer) => {
              resolve(answer);
            });
          });
          const supplyToLendAmount = await getSupply(depositContract, userHandle, tokenAddress, fhevm, wallet);
          console.log("💰 Supply to lend amount:", supplyToLendAmount);
        } catch (error) {
          console.error("Error during supply to lend amount:", error);
        }
        break;

      case "11": // claim lending
        console.log("💰 Claiming lending");
        try {
          const receiptClaim = await claimLending(lendingTokenContract);
          console.log("💰 Claimed lending successfully", receiptClaim.hash);
        } catch (error) {
          console.error("Error during claim lending:", error);
        }
        break;

      case "12": // withdraw from deposit
        console.log("💰 Withdrawing from deposit");
        try {
          // get token address
          const tokenAddress = await new Promise<string>((resolve) => {
            rl.question("Enter token address: ", (answer) => {
              resolve(answer);
            });
          });
          // get amount
          const amount = await new Promise<number>((resolve) => {
            rl.question("Enter amount: ", (answer) => {
              resolve(Number(answer));
            });
          });
          const receiptWithdraw = await withdrawFromDeposit(depositContract, tokenAddress, amount);
          console.log("💰 Withdrawal successful", receiptWithdraw.hash);
        } catch (error) {
          console.error("Error during withdrawal:", error);
        }
        break;

      default:
        break;
    }

    const continueChoice = await new Promise<string>((resolve) => {
      rl.question("\nDo you want to do another operation? (y/n): ", (answer) => {
        resolve(answer);
      });
    });

    if (continueChoice.toLowerCase() === "n") {
      console.log("👋 Exiting...");
      rl.close();
      process.exit(0);
    }
  }
}

main().catch((error) => {
  console.error(error);
  rl.close();
  process.exit(1);
});

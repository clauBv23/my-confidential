import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const aavePoolAddress = "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951";
  const deployed = await deploy("ConfidentialLending", {
    from: deployer,
    args: [aavePoolAddress],
    log: true,
  });

  console.log(`ConfidentialLending contract: `, deployed.address);
};

export default func;
// func.id = "deploy_confidentialLending";
func.tags = ["ConfidentialLending"];

import { runPairAndLaunchDryRun } from '../agents';

function main(): void {
  runPairAndLaunchDryRun({ args: process.argv.slice(2) });
}

main();

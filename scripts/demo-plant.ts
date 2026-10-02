/** `pnpm demo:plant`: adds the 4 labelled planted test inputs (reused, stock, location, stamp). */
import "./_env";
import { runDemoPlant } from "../src/lib/demo/run";
import { runCli } from "./_demo-cli";

void runCli("demo:plant", () => runDemoPlant({ inline: true, offline: process.argv.includes("--offline"), log: (m) => console.log(m) }));

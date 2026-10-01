const path = require("node:path");

const preload = path.join(__dirname, "preload.cjs");
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${preload}`]
  .filter(Boolean)
  .join(" ");
require(preload);

import("tsx/cli");

import { registerFlow, instantiateFlow } from '../ruleflow.js';

globalThis.myGlobalVar = 123;

const flow = `
[interval 1 1 4 "out"]
[map 2 "in" "n => n*myGlobalVar" "out"]
[console 3 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
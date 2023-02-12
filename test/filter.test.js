import { registerFlow, instantiateFlow } from '../ruleflow.js';

const flow = `
[interval 1 1 10 "out"]
[filter 2 "in" "n => n%2 === 0" "out"]
[console 3 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
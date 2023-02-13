import { registerFlow, instantiateFlow } from '../ruleflow.js';

const flow = `
[interval 1 1 4 "out"]
[map 2 "in" "n => n*2" "out"]
[javascript 3 "console.log('I am doing nothing (but printing this message)!')"]
[rand 3 "in"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
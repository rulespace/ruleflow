import { registerFlow, instantiateFlow } from '../ruleflow.js';

globalThis.myDebugOperator = async function*(outPort)
{
  let input = yield; 
  while (true)
  {
    console.log(`debugging: ${input}`);
    input = yield input.map(([_in, n])=>[outPort, n]);
  }
}

const nestedFlow = `
[filter 1 "in" "n => n%2 === 0" "out"]
[map 2 "in" "n => n*2" "out"]
[javascript 3 "yield* myDebugOperator('out')"]
[rand 3 "in"]
[ret 3 "out"]

[link 1 "out" 2 "in"]
[link 2 "out" 3 "in"]
`;

registerFlow('nested', nestedFlow);

const flow = `
[interval "i1" 6 12 "out"]
[interval "i2" 1 4 "out"]
[ref "n" "nested"]
[console "c" "in"]

[link "i1" "out" "n" "in"]
[link "i2" "out" "n" "in"]
[link "n" "out" "c" "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');

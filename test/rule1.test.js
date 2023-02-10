import { registerFlow, instantiateFlow } from '../ruleflow.js';
import { compileToConstructor } from '../deps.ts';


globalThis.ruleHandler =
  async function*(rule)
  {
    const ctr = compileToConstructor(rule);
    const instance = ctr();
    let input = yield;
    do
    {
      const add = new Map();
      const remove = new Map();
      for (const [inPort, fact] of input)
      {
        const factCtr = instance[fact[0]];
        const instanceFact = new factCtr(...fact.slice(1));
        if (inPort === 'add')
        {
          add.set(factCtr, add.has(factCtr) ? add.get(factCtr).push(instanceFact) : [instanceFact]);
        }
        else if (inPort === 'remove')
        {
          remove.set(factCtr, remove.has(factCtr) ? remove.get(factCtr).push(instanceFact) : [instanceFact]);
        }
        else
        {
          throw new Error(`cannot handle input port ${inPort}`);
        }
      }
      const delta = instance.computeDelta(add, remove);
      const added = [...delta.added().values()].flat().map(f => ['added', [f.name(), ...f.values()]]);
      const removed = [...delta.removed().values()].flat().map(f => ['removed', [f.name(), ...f.values()]]);
      input = yield removed.concat(added);
    }
    while (true);      
  }

const flow = `
[rator 1 "yield; for (let n = 1; n <= 4; n++) yield [['out', ['Input', n]]];"]
[ret 1 "out"]

[rator 2 "yield* ruleHandler('(rule [Doubled (* n 2)] [Input n])')"]
[rand 2 "add"]
[ret 2 "added"]

[rator 3 "while (true) {const [[_in, n]] = yield; console.log('out ' + n)}"]
[rand 3 "in"]

[link 1 "out" 2 "add"]
[link 2 "added" 3 "in"]
`;

registerFlow('flow', flow);
instantiateFlow('flow');
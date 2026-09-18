import fs from 'node:fs'
import path from 'node:path'
import solc from 'solc'

const contracts=['FlowSub.sol','MockUSDT.sol']
const sources=Object.fromEntries(contracts.map(name=>[name,{content:fs.readFileSync(path.resolve('contracts',name),'utf8')}]))
const input={language:'Solidity',sources,settings:{evmVersion:'paris',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}
const output=JSON.parse(solc.compile(JSON.stringify(input)))
const errors=(output.errors||[]).filter(x=>x.severity==='error')
if(errors.length){errors.forEach(x=>console.error(x.formattedMessage));process.exit(1)}
fs.mkdirSync('artifacts',{recursive:true})
fs.writeFileSync(path.resolve('artifacts','standard-input.json'),JSON.stringify(input,null,2))
fs.writeFileSync(path.resolve('artifacts','compiler-version.txt'),`v${solc.version().replace('.Emscripten.clang','')}`)
for(const [file,name] of [['FlowSub.sol','FlowSub'],['MockUSDT.sol','MockUSDT']]){
  const result=output.contracts[file][name]
  fs.writeFileSync(path.resolve('artifacts',`${name}.json`),JSON.stringify({abi:result.abi,bytecode:`0x${result.evm.bytecode.object}`},null,2))
  console.log(`Compiled ${name}`)
}

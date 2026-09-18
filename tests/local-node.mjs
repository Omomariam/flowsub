import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { bytesToHex } from 'viem'
import { mnemonicToAccount } from 'viem/accounts'

export async function localNode(chainId) {
  const socket=net.createServer()
  await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve))
  const port=socket.address().port
  await new Promise(resolve=>socket.close(resolve))
  const local=path.resolve('.runtime/tools/package/bin',process.platform==='win32'?'anvil.exe':'anvil')
  const binary=process.env.ANVIL_BINARY || (fs.existsSync(local)?local:'anvil')
  const mnemonic='test test test test test test test test test test test junk'
  const accounts=Array.from({length:10},(_,addressIndex)=>mnemonicToAccount(mnemonic,{addressIndex}))
  const keys=accounts.map(account=>bytesToHex(account.getHdKey().privateKey))
  const child=spawn(binary,['--host','127.0.0.1','--port',String(port),'--chain-id',String(chainId),'--mnemonic',mnemonic,'--hardfork','shanghai','--silent'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
  let startupError,stderr=''
  child.on('error',error=>{startupError=error})
  child.stderr.on('data',chunk=>{stderr+=chunk})
  const rpc=`http://127.0.0.1:${port}`
  let id=0
  const request=async({method,params=[]})=>{
    const response=await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})})
    const result=await response.json()
    if(result.error) throw Object.assign(new Error(result.error.message),result.error)
    return result.result
  }
  const close=async()=>{if(child.exitCode!==null || startupError) return;const exited=once(child,'exit');child.kill();await exited}
  for(let attempt=0;attempt<100;attempt++) {
    if(startupError || child.exitCode!==null) throw new Error(`Cannot start Anvil. Install Foundry or set ANVIL_BINARY. ${startupError?.message || stderr}`)
    try {await request({method:'eth_chainId'});return {rpc,accounts,keys,provider:{request,disconnect:close},close} }
    catch {await new Promise(resolve=>setTimeout(resolve,100))}
  }
  await close();throw new Error(`Anvil startup timed out: ${stderr}`)
}

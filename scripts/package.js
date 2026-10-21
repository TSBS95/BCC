const path = require('node:path');
const fs = require('node:fs/promises');
const {spawnSync} = require('node:child_process');
async function main() {
  const {packager} = await import('@electron/packager');
  const root = path.resolve(__dirname,'..');
  const outputs = await packager({dir:root,out:path.join(root,'dist'),name:'BCC FX Manager',icon:path.join(root,'assets/icon.ico'),platform:'win32',arch:'x64',overwrite:true,asar:true,prune:true,ignore:[/^\/dist(?:\/|$)/,/^\/\.cache(?:\/|$)/,/^\/test(?:\/|$)/,/^\/\.github(?:\/|$)/,/^\/scripts(?:\/|$)/],appVersion:require('../package.json').version,win32metadata:{CompanyName:'BCC FX Manager',FileDescription:'BCC FX Manager',ProductName:'BCC FX Manager'},download:{cacheRoot:path.join(root,'.cache','electron')}});
  const folder = outputs[0];
  await fs.copyFile(path.join(root,'README.md'),path.join(folder,'READ-ME.txt'));
  const zip = path.join(root,'dist','BCC-FX-Manager-Windows-x64.zip');
  await fs.rm(zip,{force:true});
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`Compress-Archive -LiteralPath '${folder.replace(/'/g,"''")}' -DestinationPath '${zip.replace(/'/g,"''")}' -Force`],{stdio:'inherit'})
    : spawnSync('zip',['-q','-r',zip,path.basename(folder)],{cwd:path.dirname(folder),stdio:'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('ZIP packaging failed.');
  console.log('Windows download: '+zip);
}
main().catch(e=>{console.error(e);process.exitCode=1;});

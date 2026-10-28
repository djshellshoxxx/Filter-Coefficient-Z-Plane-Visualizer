import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist');
for(const file of ['index.html','styles.css','favicon.svg','.nojekyll','THIRD_PARTY_NOTICES.md'])await copyFile(file,`dist/${file}`);
await cp('src','dist/src',{recursive:true});
await cp('docs','dist/docs',{recursive:true});
console.log('Static site built in dist/');

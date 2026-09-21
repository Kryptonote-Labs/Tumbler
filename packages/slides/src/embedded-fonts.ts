import {eotToTtf} from "mtx-decompressor";
/** Extract browser-readable SFNT data from raw fonts or an uncompressed EOT wrapper. */
export function embeddedFontBytes(bytes: Uint8Array): Uint8Array | undefined {
 const signature = (data:Uint8Array) => data.length >= 4 && [0x00010000,0x4f54544f,0x74727565,0x774f4646,0x774f4632].includes(new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(0));
 if(signature(bytes))return bytes;
 if(bytes.length<82)return;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const size=view.getUint32(0,true),length=view.getUint32(4,true),flags=view.getUint32(12,true);
 if(size!==bytes.length || length>size-82 || view.getUint16(34,true)!==0x504c || bytes.length>16*1024*1024)return;
 if((flags&4)!==0)try {const font=eotToTtf(bytes);return font.length<=64*1024*1024 && signature(font)?font:undefined;}catch{return;}
 const data=bytes.slice(size-length);
 if(flags&0x10000000)for(let i=0;i<data.length;i++)data[i]=data[i]!^0x50;
 return signature(data)?data:undefined;
}

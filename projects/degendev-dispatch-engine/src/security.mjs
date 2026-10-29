import crypto from 'node:crypto';
const b64url = input => Buffer.from(input).toString('base64url');
export function sha256Hex(value){return crypto.createHash('sha256').update(value,'utf8').digest('hex');}
export function createApprovalToken({proposalId,action,expiresAt,secret}){
 if(!['approve','reject'].includes(action))throw new Error('invalid action');
 if(!secret||secret.length<32)throw new Error('APPROVAL_HMAC_SECRET must be at least 32 characters');
 const nonce=crypto.randomBytes(32).toString('base64url');
 const payload=`${proposalId}.${action}.${Math.floor(new Date(expiresAt).getTime()/1000)}.${nonce}`;
 const signature=crypto.createHmac('sha256',secret).update(payload).digest();
 const token=`${b64url(payload)}.${signature.toString('base64url')}`;
 return {token,digest:sha256Hex(token),expiresAt:new Date(expiresAt).toISOString()};
}
export function verifyApprovalToken({token,proposalId,action,secret,now=Date.now()}){
 if(typeof token!=='string'||token.length>2048)return {ok:false,reason:'malformed'};
 if(!secret||secret.length<32)throw new Error('APPROVAL_HMAC_SECRET must be at least 32 characters');
 const [encoded,signature,extra]=token.split('.');
 if(!encoded||!signature||extra)return {ok:false,reason:'malformed'};
 let payload,sig; try{payload=Buffer.from(encoded,'base64url').toString('utf8');sig=Buffer.from(signature,'base64url');}catch{return {ok:false,reason:'malformed'};}
 const expected=crypto.createHmac('sha256',secret).update(payload).digest();
 if(sig.length!==expected.length||!crypto.timingSafeEqual(sig,expected))return {ok:false,reason:'signature'};
 const [id,verb,expiry,nonce]=payload.split('.');
 if(id!==proposalId||verb!==action||!/^\d+$/.test(expiry||'')||!nonce)return {ok:false,reason:'binding'};
 if(Number(expiry)*1000<=now)return {ok:false,reason:'expired'};
 return {ok:true,digest:sha256Hex(token),expiresAt:new Date(Number(expiry)*1000).toISOString()};
}

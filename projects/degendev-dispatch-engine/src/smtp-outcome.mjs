export function classifySmtpOutcome({phase,accepted=false,rejected=false,errorCode=null}){
 if(accepted&&!rejected)return {outcome:'accepted',retryAllowed:false,state:'dispatched'};
 if(rejected&&phase==='pre_data')return {outcome:'rejected',retryAllowed:false,state:'pending_approval'};
 if(['data_started','data_complete','unknown'].includes(phase))return {outcome:'unknown',retryAllowed:false,state:'dispatch_unknown',errorCode};
 return {outcome:'rejected',retryAllowed:false,state:'pending_approval',errorCode};
}

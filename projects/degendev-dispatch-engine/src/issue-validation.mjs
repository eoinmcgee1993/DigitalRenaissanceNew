const ISSUE_RE=/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/issues\/([1-9]\d*)\/?$/;
export function parseIssueUrl(input){
 if(typeof input!=='string')throw new Error('issue URL must be a string');
 const m=ISSUE_RE.exec(input.trim()); if(!m)throw new Error('expected a canonical public GitHub issue URL');
 return {url:`https://github.com/${m[1]}/${m[2]}/issues/${m[3]}`,owner:m[1],repo:m[2],issueNumber:Number(m[3]),repoFullName:`${m[1]}/${m[2]}`};
}
export function isIssueStale({state,mergedPrReferencesIssue=false}){return String(state).toLowerCase()==='closed'||mergedPrReferencesIssue===true;}
export function validatePublicIssue(issue){
 const errors=[];
 if(!issue||issue.pull_request)errors.push('not_an_issue');
 if(issue?.state!=='open')errors.push('issue_not_open');
 if(issue?.repository?.private===true)errors.push('private_repository');
 if(!issue?.title?.trim())errors.push('missing_title');
 if(!issue?.html_url?.startsWith('https://github.com/'))errors.push('invalid_canonical_url');
 return {ok:errors.length===0,errors};
}

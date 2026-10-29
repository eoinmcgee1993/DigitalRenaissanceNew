import test from 'node:test';
import assert from 'node:assert/strict';
import {createApprovalToken,verifyApprovalToken} from '../src/security.mjs';
import {parseIssueUrl,isIssueStale,validatePublicIssue} from '../src/issue-validation.mjs';
import {classifySmtpOutcome} from '../src/smtp-outcome.mjs';
const secret='test-only-secret-that-is-at-least-32-characters-long';
test('token binds proposal and action and expires',()=>{
 const {token,digest}=createApprovalToken({proposalId:'p-123',action:'approve',expiresAt:'2030-01-01T00:00:00Z',secret});
 assert.equal(verifyApprovalToken({token,proposalId:'p-123',action:'approve',secret,now:Date.parse('2029-01-01')}).ok,true);
 assert.equal(verifyApprovalToken({token,proposalId:'p-999',action:'approve',secret}).ok,false);
 assert.equal(verifyApprovalToken({token,proposalId:'p-123',action:'reject',secret}).ok,false);
 assert.equal(verifyApprovalToken({token,proposalId:'p-123',action:'approve',secret,now:Date.parse('2031-01-01')}).reason,'expired');
 assert.equal(digest.length,64);
});
test('canonical issue URL parsing rejects malicious hosts',()=>{
 assert.equal(parseIssueUrl('https://github.com/acme/app/issues/42').issueNumber,42);
 assert.throws(()=>parseIssueUrl('https://github.com.evil.example/acme/app/issues/42'));
 assert.throws(()=>parseIssueUrl('https://github.com/acme/app/pull/42'));
});
test('closed issues and merged referencing PRs are stale',()=>{
 assert.equal(isIssueStale({state:'closed'}),true);
 assert.equal(isIssueStale({state:'open',mergedPrReferencesIssue:true}),true);
 assert.equal(isIssueStale({state:'open'}),false);
});
test('private issue and pull request payloads fail validation',()=>{
 assert.equal(validatePublicIssue({state:'open',title:'x',html_url:'https://github.com/a/b/issues/1',repository:{private:false}}).ok,true);
 assert.equal(validatePublicIssue({state:'open',title:'x',html_url:'https://github.com/a/b/issues/1',repository:{private:true}}).ok,false);
 assert.equal(validatePublicIssue({state:'open',title:'x',html_url:'https://github.com/a/b/issues/1',repository:{private:false},pull_request:{}}).ok,false);
});
test('ambiguous SMTP transmission cannot be retried',()=>{
 assert.deepEqual(classifySmtpOutcome({phase:'data_started',errorCode:'ETIMEDOUT'}),{outcome:'unknown',retryAllowed:false,state:'dispatch_unknown',errorCode:'ETIMEDOUT'});
});

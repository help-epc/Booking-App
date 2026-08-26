import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {previewE2E}=require('../api/mobile-index.js');

test('preview E2E bypass is limited to the exact protected V3 integration branch',()=>{
 const before={env:process.env.VERCEL_ENV,ref:process.env.VERCEL_GIT_COMMIT_REF};
 try{
  process.env.VERCEL_ENV='preview';
  process.env.VERCEL_GIT_COMMIT_REF='codex/v3-booking-integration';
  assert.equal(previewE2E(),true);

  process.env.VERCEL_ENV='production';
  assert.equal(previewE2E(),false);

  process.env.VERCEL_ENV='preview';
  process.env.VERCEL_GIT_COMMIT_REF='main';
  assert.equal(previewE2E(),false);
 }finally{
  if(before.env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=before.env;
  if(before.ref===undefined)delete process.env.VERCEL_GIT_COMMIT_REF;else process.env.VERCEL_GIT_COMMIT_REF=before.ref;
 }
});

'use strict';

const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const koaRequest = require('koa-http-request');
const views = require('koa-views');
const serve = require('koa-static');

const fs = require('fs');

const mongo = require('mongodb');

const co = require('co');

const { resolve } = require('path');
const { reject } = require('underscore');
const { POINT_CONVERSION_COMPRESSED } = require('constants');

const router = new Router();
const app = module.exports = new Koa();

app.use(bodyParser());

app.use(koaRequest({
  
}));

app.use(views(__dirname + '/views', {
  map: {
    html: 'underscore'
  }
}));

app.use(serve(__dirname + '/public'));

// Mongo URL and DB name for date store
const MONGO_URL = `${process.env.MY_MONGO_URL}`;
const MONGO_DB_NAME = `${process.env.MY_MONGO_DB_NAME}`;
const MONGO_COLLECTION = 'googlesearchscraper';

const SEARCH_URL = 'https://www.google.com/search';
const MAX_COUNT = parseInt(`${process.env.MY_MAX_COUNT}`);

router.get('/',  async (ctx, next) => {  
  console.log("+++++++++ / ++++++++++");

  await ctx.render('top', {
    query: 'site:thebase.in',
    path: 'law',
    regex: '[A-Za-z0-9]{1}[A-Za-z0-9_.-]*@{1}[A-Za-z0-9_-]{1,}\.[A-Za-z0-9]{1,}(\.[A-Za-z0-9]{1,})?',
    start: 1,
    tag: '',
    count: MAX_COUNT
  });  
});

router.post('/',  async (ctx, next) => {  
  console.log("+++++++++ / ++++++++++");

  const tag = generateTag();

  const query = ctx.request.body.query;
  const path = ctx.request.body.path;  
  const regex = new RegExp(ctx.request.body.regex);
  const start = parseInt(ctx.request.body.start);

  console.log(`=== PARAMS[tag: ${tag}]: query ${query} path ${path} regex ${regex} start ${start}`);  

  const crawl = co.wrap(function*(start) {
    console.log(`=== SEARCH URL[tag: ${tag}]: ${SEARCH_URL} q ${query} start ${start}`);
    const res =  yield ctx.get(SEARCH_URL, {"q": query, "start": `${start}`}).then(r => resolve(r));
    const hrefRegex = /[^<]*(<a href="([^"]+)">)/g;
    //console.log(`=== RES: ${res}`);
    const urls = [];
    const anchors = res.matchAll(hrefRegex);
    for (const anchor of anchors) {
      console.log(`=== ANCHOR[tag: ${tag}]: ${anchor}`);
      const href = anchor.toString().split(',')[2];
      console.log(`=== HREF[tag: ${tag}]: ${href}`);
      if (href.indexOf('/url?q=') == 0 && href.indexOf('google.com') == -1) {
          let url = href.replace('/url?q=','').replace(/(https?):\/([^\/])/g, `$1://$2`);
          url = url.substring(0, url.lastIndexOf('/'));
          url = `${url}/${path}`;
          console.log(`=== URL[tag: ${tag}]: ${url}`);
          urls.push(url);
      }
    }
    console.log(JSON.stringify(`=== URLS[tag: ${tag}]: ${JSON.stringify(urls)}`));
    if (urls.length == 0) return reject('No data hit.');
    const promises = urls.map(url => ctx.get(url).then(r => {
      const found = r.matchAll(regex);
      let data = "";
      for (const f of found) {
         data = data + f.toString().replace(',', ' ');
      }
      console.log(`=== DATA[tag: ${tag}]: ${data}`);
      return resolve(JSON.stringify({ "url": url, "data": data}));
    }).catch(e => {
      console.log(`=== URL ERROR[tag: ${tag}]: ${url} is not accessible.`);
      return null;
    }));
    return yield promises;    
  });  

  let count = 0;

  const crawlAll = function(start) {
    crawl(start).then(r => {
      console.log(`SUCCESS[tag: ${tag}]: ${JSON.stringify(r)}`);
      for (const ret of r) {
        if (ret == null) continue;
        console.log(`DDDDDDDDDD  ${typeof ret}`);
        const d = JSON.parse(ret.substring(ret.indexOf('{')));
        console.log(`RET[tag: ${tag}]: ${JSON.stringify(d)}`);
        insertDB(tag, d);
      }

      count = count + 1;

      if (count > MAX_COUNT) {
        console.log(`=== STOP[[tag: ${tag}]]: The count exceeded the maximum ${MAX_COUNT}`);
        return;
      }

      crawlAll(start + 10);    
    }).catch(e => {
      console.log(`EROOR[tag: ${tag}]: ${e}`);
    });
  }

  crawlAll(start);

  await ctx.render('top', {
    query: query,
    path: path,
    regex: ctx.request.body.regex,
    start: start,
    tag: tag,
    count: MAX_COUNT
  });
  
});

router.get('/result',  async (ctx, next) => {  
  console.log("+++++++++ /result ++++++++++");

  const tag = ctx.request.query.tag;  

  const resAll = await(findDB(tag));
  const res = await(findDB(tag, true));

  ctx.set('Content-Type','text/plain');
  ctx.body = JSON.stringify({
    "all_count": resAll.length,
    "data_count": res.length
  });
});

router.get('/csv',  async (ctx, next) => {  
  console.log("+++++++++ /csv ++++++++++");

  const tag = ctx.request.query.tag;  

  const res = await(findDB(tag, true));

  let csv = "";
  csv = (`url,data\n`);
  for (const r of res) {
    csv = csv + `${r.data.url},${r.data.data}\n`;
  }

  ctx.set('Content-Type','text/plain');
  ctx.body = csv;
});

const generateTag = function (){
  return new Date().getTime().toString(16) + Math.floor(1000*Math.random()).toString(16);
}

const insertDB = function(tag, data) {
  return new Promise(function (resolve, reject) { mongo.MongoClient.connect(MONGO_URL).then(function(db){
    //console.log(`insertDB Connected: ${MONGO_URL}`);
    var dbo = db.db(MONGO_DB_NAME);    
    //console.log(`insertDB Used: ${MONGO_DB_NAME}`);
    console.log(`insertDB insertOne, tag:${tag}`);
    dbo.collection(MONGO_COLLECTION).insertOne({"tag": tag, "data": data}).then(function(res){
      db.close();
      return resolve(0);
    }).catch(function(e){
      console.log(`insertDB Error ${e}`);
    });
  }).catch(function(e){
    console.log(`insertDB Error ${e}`);
  });});
};

const findDB = function(tag, withData = false) {
  return new Promise(function(resolve, reject) { mongo.MongoClient.connect(MONGO_URL).then(function(db){
    //console.log(`getDB Connected ${MONGO_URL}`);
    var dbo = db.db(MONGO_DB_NAME);    
    //console.log(`getDB Used ${MONGO_DB_NAME}`);
    console.log(`getDB find, tag:${tag}`);
    let q = {"tag": `${tag}`};
    if (withData) q['data.data'] = { $ne: "" };
    dbo.collection(MONGO_COLLECTION).find(q, {"projection": {"_id":0, "tag":1, "data":1}}).toArray().then(function(res){
      db.close();
      if (res == null) return resolve(null);
      return resolve(res);
    }).catch(function(e){
      console.log(`getDB Error ${e}`);
      return resolve(null);
    });
  }).catch(function(e){
    console.log(`getDB Error ${e}`);
    return resolve(null);
  });});
};

app.use(router.routes());
app.use(router.allowedMethods());

if (!module.parent) app.listen(process.env.PORT || 3000);
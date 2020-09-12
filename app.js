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

router.get('/',  async (ctx, next) => {  
  console.log("+++++++++ / ++++++++++");

  await ctx.render('top', {
    query: 'site:thebase.in',
    path: 'law',
    regex: '[A-Za-z0-9]{1}[A-Za-z0-9_.-]*@{1}[A-Za-z0-9_.-]{1,}\.[A-Za-z0-9]{1,}',
    tag: ''
  });  
});

router.post('/',  async (ctx, next) => {  
  console.log("+++++++++ / ++++++++++");

  const query = ctx.request.body.query;
  const path = ctx.request.body.path;  
  const regex = new RegExp(ctx.request.body.regex);
  console.log(`query: ${query} path: ${path} regex: ${regex}`);

  const tag = generateTag();

  co(function*() {
    const res =  yield ctx.get(`https://www.google.com/search`, {"q": query, "start": "0"}).then(r => resolve(r));
    const hrefRegex = /[^<]*(<a href="([^"]+)">)/g;
    console.log(`=== RES: ${res}`);
    const urls = [];
    const anchors = res.matchAll(hrefRegex);
    for (const anchor of anchors) {
      console.log(`=== ANCHOR: ${anchor}`);
      const href = anchor.toString().split(',')[2];
      console.log(`=== HREF: ${href}`);
      if (href.indexOf('/url?q=') == 0 && href.indexOf('google.com') == -1) {
          let url = href.replace('/url?q=','');
          url = url.substring(0, url.lastIndexOf('/'));
          url = `${url}/${path}`;
          //url = 'https://getabaco.thebase.in/law';
          console.log(`=== URL: ${url}`);
          urls.push(url);
      }
    }
    console.log(JSON.stringify(`=== URLS: ${JSON.stringify(urls)}`));
    if (urls.length == 0) return null;
    const promises = urls.map(url => ctx.get(url).then(r => {
      let data = r.match(regex);
      console.log(`=== DATA: ${data}`);
      if (data != null) data = data[0];
      return resolve(JSON.stringify({ "url": url, "data": data}));
    }).catch(e => {
      return resolve(JSON.stringify({ "url": url, "data": ''}));
    }));
    return yield promises;
    
  }).then(r => {
    console.log(`SUCCESS: ${JSON.stringify(r)}`);
    for (const ret of r) {
      const d = JSON.parse(ret.substring(ret.indexOf('{')));
      console.log(`RET: ${JSON.stringify(d)}`);
      insertDB(tag, d);
    }    
  }).catch(e => console.log(`EROOR: ${e}`));

  await ctx.render('top', {
    query: query,
    path: path,
    regex: regex,
    tag: tag
  });
  
});

router.get('/result',  async (ctx, next) => {  
  console.log("+++++++++ /result ++++++++++");

  const tag = ctx.request.query.tag;  

  const res = await(findDB(tag));

  ctx.set('Content-Type','text/plain');
  ctx.body = `${res.length}`;  
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

const findDB = function(tag) {
  return new Promise(function(resolve, reject) { mongo.MongoClient.connect(MONGO_URL).then(function(db){
    //console.log(`getDB Connected ${MONGO_URL}`);
    var dbo = db.db(MONGO_DB_NAME);    
    //console.log(`getDB Used ${MONGO_DB_NAME}`);
    console.log(`getDB find, tag:${tag}`);
    dbo.collection(MONGO_COLLECTION).find({"tag": `${tag}`}, {"projection": {"_id":0, "tag":1, "data":1}}).toArray().then(function(res){
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
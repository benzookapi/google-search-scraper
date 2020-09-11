'use strict';

const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const koaRequest = require('koa-http-request');
const views = require('koa-views');
const serve = require('koa-static');

const fs = require('fs');

const mongo = require('mongodb');

const cheerio = require('cheerio')

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
const MONGO_URL = `${process.env.SHOPIFY_MONGO_URL}`;
const MONGO_DB_NAME = `${process.env.SHOPIFY_MONGO_DB_NAME}`;
const MONGO_COLLECTION = 'googlesearchscraper';

// Set Timezone Japan
//process.env.TZ = 'Asia/Tokyo'; 



router.get('/',  async (ctx, next) => {  
  console.log("+++++++++ / ++++++++++");
  
    await ctx.render('top', {
      res: ''
    });
  
});

router.post('/',  async (ctx, next) => {  
  console.log("+++++++++ / ++++++++++");

  const query = ctx.request.body.query;

  const path = ctx.request.body.path;
  
  const regex = new RegExp(tx.request.body.regex);

  const key = generateKey();

  accessEndpoint(ctx, `https://www.google.com/search`, {"q": query, "start": "0"}).then(function(res){
    const $ = cheerio.load(res); 
    let url = null; 
    let found = null;
    let result = $('a').map(function(i, el) {
      url = $(this).attr('href');
      //console.log(h);
      if (url.indexOf('/url?q=') == 0 && url.indexOf('google.com') == -1) {
        url = url.replace('/url?q=','');
        url = url.substring(0, url.lastIndexOf('/'));
        console.log(url);
        accessEndpoint(ctx, h, null).then(function(r){
          found = r.match(regex);
          console.log(found);
          if (found != null) {
            return { "url": url, "data": found[0]};       
          }
        });      
      }
    }).get();
    insertDB(key, result);
  });

  await ctx.render('top', {
      res: JSON.stringify({}, null, null)
  });
  
});





const accessEndpoint = function(ctx, endpoint, req, content_type = "text/html; charset=UTF-8", method = 'GET') {
  console.log(`accessEndpoint　${endpoint} ${JSON.stringify(req)} ${content_type} ${method}`);
  return new Promise(function(resolve, reject) { 
    // Success callback
    var then_func = function(res){
      //console.log(`accessEndpoint Success: ${res}`);
      return resolve(res);
    };
    // Failure callback
    var catch_func = function(e){
      console.log(`accessEndpoint Error: ${e}`);
      return resolve(e);      
    };
    let headers = {};
    headers['Content-Type'] = content_type;
    if (method == 'POST') {
      ctx.post(endpoint, req, headers).then(then_func).catch(catch_func);
    } else if (method == 'PATCH') {
      ctx.patch(endpoint, req, headers).then(then_func).catch(catch_func);
    } else if (method == 'PUT') {
      ctx.put(endpoint, req, headers).then(then_func).catch(catch_func);
    } else if (method == 'DELETE') {
      ctx.delete(endpoint, req, headers).then(then_func).catch(catch_func);
    } else { // Default GET
      ctx.get(endpoint, req, headers).then(then_func).catch(catch_func);
    }    
  });
};    

const generateKey = function (){
  return new Date().getTime().toString(16) + Math.floor(1000*Math.random()).toString(16);
 }


const insertDB = function(key, data) {
  return new Promise(function (resolve, reject) { mongo.MongoClient.connect(MONGO_URL).then(function(db){
    //console.log(`insertDB Connected: ${MONGO_URL}`);
    var dbo = db.db(MONGO_DB_NAME);    
    //console.log(`insertDB Used: ${MONGO_DB_NAME}`);
    console.log(`insertDB insertOne, _id:${key}`);
    dbo.collection(MONGO_COLLECTION).insertOne({"_id": key, "data": data}).then(function(res){
      db.close();
      return resolve(0);
    }).catch(function(e){
      console.log(`insertDB Error ${e}`);
    });
  }).catch(function(e){
    console.log(`insertDB Error ${e}`);
  });});
};


const getDB = function(key) {
  return new Promise(function(resolve, reject) { mongo.MongoClient.connect(MONGO_URL).then(function(db){
    //console.log(`getDB Connected ${MONGO_URL}`);
    var dbo = db.db(MONGO_DB_NAME);    
    //console.log(`getDB Used ${MONGO_DB_NAME}`);
    console.log(`getDB findOne, _id:${key}`);
    dbo.collection(MONGO_COLLECTION).findOne({"_id": `${key}`}).then(function(res){
      db.close();
      if (res == null) return resolve(null);
      return resolve(res.data);
    }).catch(function(e){
      console.log(`getDB Error ${e}`);
    });
  }).catch(function(e){
    console.log(`getDB Error ${e}`);
  });});
};


const setDB = function(key, data) {
  return new Promise(function(resolve, reject) { mongo.MongoClient.connect(MONGO_URL).then(function(db){
    //console.log(`setDB Connected ${MONGO_URL}`);
    var dbo = db.db(MONGO_DB_NAME);    
    //console.log(`setDB Used ${MONGO_DB_NAME}`);
    console.log(`setDB findOneAndUpdate, _id:${key}`);
    dbo.collection(MONGO_COLLECTION).findOneAndUpdate({"_id": `${key}`}, {$set: {"data": data}}, {new: true}).then(function(res){
      db.close();
      return resolve(res);
    }).catch(function(e){
      console.log(`setDB Error ${e}`);
    });
  }).catch(function(e){
    console.log(`setDB Error ${e}`);
  });});
};

app.use(router.routes());
app.use(router.allowedMethods());

if (!module.parent) app.listen(process.env.PORT || 3000);
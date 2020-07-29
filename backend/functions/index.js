const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const app = express();

/**
 * deploy code section
 */
admin.initializeApp();

/**
 * local emulator section
 */
// const serviceAccount = require("../administrator.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
//   databaseURL: "https://trying-575dc.firebaseio.com"
// });

/**
 * http request cors fail
 */

app.use(cors({ origin: true }));

/**
 * database connection
 */
var db = admin.database();

/**
 * query with using express app module
 */
app.post("/", (req, res) => {
  db.ref("/statistic").once("value", function(snapshot) {
    var bot = snapshot.val().top;
    var mid = snapshot.val().mid;
    var top = snapshot.val().bot;
    //tc alınıır değerler alınması için
    var tc = req.body.tc;
    // return res.status(200).end(JSON.stringify(tc));
    db.ref("/members").child(tc).once("value", function(snapshot) {
      snapshot.forEach(function(childSnapshot) {
        var key = childSnapshot.key; //child key
        var childData = childSnapshot.val(); //child value

        db.ref("/datas").child(key).once("value", function(dataSnapshot) {
          var xRate = dataSnapshot.val().realrate;
          var xSubRate = dataSnapshot.val()[childData].rate;

          var ref = db.ref("/result").child(tc);
          return CounterSum(ref, "coefficient", xSubRate * 100 / xRate);
        });
      });
      return null;
    });

    return db
      .ref("/result")
      .child(tc)
      .child("coefficient")
      .once("value", function(snapshot) {
        var value = snapshot.val();
        if (value <= bot) {
          db.ref("/result").child(tc).update({
            status: 0
          });
        } else if (value <= mid) {
          db.ref("/result").child(tc).update({
            status: 1
          });
        } else if (value <= top) {
          db.ref("/result").child(tc).update({
            status: 2
          });
        } else {
          db.ref("/result").child(tc).update({
            status: 3
          });
        }
        db.ref("/result").child(tc).once("value", function(snapshot) {
          return res.status(200).end(JSON.stringify(snapshot.val()));
        });
      });
  });

  // var str = {
  //   status: 2,
  //   coefficient: 171
  // };
  // return res.status(200).end(JSON.stringify(str));
});

/**
 * firebase http function
 * id query (status and coefficient) 
 */
exports.Post_Request_Check_Status = functions.https.onRequest(app);
/////////////////////////////////////////////////////////////////

/**
 * firebase update trigger function
 * check key and value, create datas collection 
 * check negative and positive status, count and change realtime datas collection 
 */
exports.Update_Create_And_NegPos_Counter = functions.database
  .ref("/members/{memberid}")
  .onUpdate((change, context) => {
    var before = change.before.val();
    var after = change.after.val();

    if (before === after) {
      console.log("before===after");
      return null;
    }
    before.status
      ? CheckStatus(before, "negative", false)
      : CheckStatus(before, "positive", false);
    after.status
      ? CheckStatus(after, "negative", true)
      : CheckStatus(after, "positive", true);

    return null;
  });

/**
 * firebase create trigger function
 * create subdatas rate sum inside /datas/dataid
 */
exports.Create_SubData_Rate = functions.database
  .ref("/datas/{dataid}/{subdataid}/rate")
  .onCreate((snapshot, context) => {
    var dataid = context.params.dataid;
    var value = snapshot.val();
    var ref = db.ref("/datas").child(dataid);
    CountRate(ref, value);
    CounterMultiRef(ref, snapshot.val());

    return null;
  });

exports.Update_SubData_Rate = functions.database
  .ref("/datas/{dataid}/{subdataid}/rate")
  .onUpdate((change, context) => {
    var before = change.before.val();
    var after = change.after.val();

    if (before === after) {
      console.log("before===after");
      return null;
    }

    var dataid = context.params.dataid;
    var ref = db.ref("/datas").child(dataid);

    CountRate(ref, -1 * before);
    CountRate(ref, after);

    CounterMultiRef(ref, change.after.val());

    return null;
  });

/////////////////////// tüm datasların oranları için///////
/////////////////////////////////////////////////////////////////
exports.Create_Data_Rate = functions.database
  .ref("/datas/{dataid}/realrate")
  .onCreate((snapshot, context) => {
    var value = snapshot.val();
    if (value >= 0) {
      var ref = db.ref("/statistic");
      CountRealRate(ref, value);
    }

    return null;
  });

exports.Update_Data_Rate = functions.database
  .ref("/datas/{dataid}/realrate")
  .onUpdate((change, context) => {
    var before = change.before.val();
    var after = change.after.val();
    if (before === after) {
      return null;
    }
    if (after >= 0) {
      var ref = db.ref("/statistic");
      CountRealRate(ref, -1 * before); ///datas/count değerini değiştirir
      CountRealRate(ref, after);
    }

    return null;
  });

function CounterMultiRef(ref, rate) {
  ref.child("count").once("value", function(snapshot) {
    // /datas/data1/count
    var count = snapshot.val();
    return ref.update({
      // /datas/data1
      realrate: rate / count * 100
    });
  });
}

//////////////////////////////////////////////////
/////////////////////////////////////
exports.Create_Deviation_Rate = functions.database
  .ref("/statistic/realrate")
  .onCreate((snapshot, context) => {
    var value = snapshot.val();

    var ref = db.ref("/datas");
    Deviation(ref, value);
    return null;
  });

exports.Update_Deviation_Rate = functions.database
  .ref("/statistic/realrate")
  .onUpdate((change, context) => {
    var before = change.before.val();
    var after = change.after.val();

    if (before === after) {
      console.log("before===after");
      return null;
    }

    var ref = db.ref("/datas");
    Deviation(ref, after);
    return null;
  });

function Deviation(ref, rate) {
  ref.child("count").once("value", function(snapshot) {
    var count = snapshot.val();
    var mid = rate / count;
    var dev = Math.sqrt(mid / count);
    var bot = 3 * dev - mid;
    var top = 3 * dev + mid;
    db.ref("/statistic").update({
      mid: mid,
      deviation: dev,
      bot: bot,
      top: top
    });
  });
}
////////////////////////////////////////////////////
////////////////////////////////////
exports.Update_SubData_Rate_Calc = functions.database
  .ref("/datas/{dataid}/{subdataid}")
  .onUpdate((change, context) => {
    var before = change.before.val();
    var after = change.after.val();
    if (before === after) {
      return null;
    }
    UpdateRate(context.params);

    return null;
  });

exports.Create_Count_SubDatas = functions.database
  .ref("/datas/{dataid}/{memberid}")
  .onCreate((snapshot, context) => {
    var dataid = context.params.dataid;
    var dataRef = db.ref("/datas").child(dataid);
    var name = snapshot.val();
    name !== 1 ? CounterSum(dataRef, "count", 1) : null;
    return null;
  });
//////////////////////////////////members create////////////////
exports.Create_Count_Members_Status = functions.database
  .ref("/members/{memberid}")
  .onCreate((snapshot, context) => {
    // var name = snapshot.val();
    // console.log(name);
    snapshot.val().status
      ? CheckStatus(snapshot.val(), "negative", true)
      : CheckStatus(snapshot.val(), "positive", true);

    //IfKeyExist(snapshot.key, snapshot.val()); //creating table
    return null;
  });
/////////////////////////////////////////////////////////////////
exports.Create_Count_Datas = functions.database
  .ref("/datas/{dataid}")
  .onCreate((snapshot, context) => {
    var name = snapshot.val();
    name !== 1 ? CounterSum(db.ref("/datas"), "count", 1) : null;
    return null;
  });
//////////////////////////////////////////////////////////////////

function IfKeyExist(dataKey, childKey) {
  //dataKey=data1 childKey=adana
  var parentRef = db.ref("/datas").child(dataKey);
  var childRef = db.ref("/datas/" + dataKey).child(childKey);

  parentRef.once("value", function(snapshot) {
    //data1 var mı kontrolü
    //eğer veri yoksa oluşturur. varsa bir şey yapmaz
    if (snapshot.val() !== null) {
      //data1 var ise
      childRef.once("value", function(snapshot) {
        //val kontrolü
        //eğer veri yoksa oluşturur. varsa bir şey yapmaz
        if (snapshot.val() === null) {
          return CreateCriterDatas(childRef); //value yoksa üretir
        }
      });
    } else {
      //data yok ise
      if (CreateCriter(parentRef, dataKey) !== null) {
        //status değilse veriler oluşturulur
        childRef.once("value", function(snapshot) {
          //val kontrolü
          //eğer veri yoksa oluşturur. varsa bir şey yapmaz
          snapshot.val() !== null ? true : CreateCriterDatas(childRef); //value yoksa üretir
        });
      }
    }
  });
}

function UpdateRate(changeParams) {
  var dataid = changeParams.dataid;
  var subdataid = changeParams.subdataid;

  var subDataRef = db.ref("/datas").child(dataid).child(subdataid);

  db.ref("/datas").child(dataid).once("value", function(snapshot) {
    subDataRef.once("value", function(snapshot) {
      var negative = snapshot.val().negative;
      var positive = snapshot.val().positive;
      if (negative !== undefined && positive !== undefined) {
        return subDataRef.update({
          rate: negative / (negative + positive)
        });
      }
    });
  });
}

function CreateCriter(parentRef, check) {
  if (check !== "status") {
    //members dan gelen veri status değilse bunun için datas altında bir kriter oluşturur
    // datasRef = db.ref("/datas");
    // Counter(datasRef, "count"); //oluşturulan kriter için count değeri bir arttırılır
    return parentRef.set({
      count: 0,
      rate: 0
    });
  }
  return null;
}

function CreateCriterDatas(childRef) {
  //childRef=/datas/data1/1
  //console.log("CreateCriterDatas:" + childRef.parent);
  //Counter(childRef.parent, "count");
  return childRef.set({
    negative: 0,
    positive: 0,
    rate: 0
  });
}

function CheckStatus(snapshotVal, child, ifValue) {
  //ifValue=boolen update or create
  //if true => sum
  //if false=> sub
  delete snapshotVal["status"];

  Object.keys(snapshotVal).forEach(function(parentKey) {
    // parentKey=data1 name[parentKey]=adana
    var key = parentKey; //child key
    var childData = snapshotVal[parentKey]; //child value
    //console.log("key:" + key + " val:" + childData);
    var childRef = db.ref("/datas/" + key + "/" + childData);
    ifValue ? CounterSum(childRef, child, 1) : CounterSum(childRef, child, -1);
  });
}

function CounterSum(countRef, countingData, countTime) {
  countRef.child(countingData).transaction(function(currentValue) {
    return (currentValue || 0) + countTime;
  });
}

function CountRate(ref, countTime) {
  CounterSum(ref, "rate", countTime);
}
function CountRealRate(ref, countTime) {
  console.log("realRate:" + countTime);
  CounterSum(ref, "realrate", countTime);
}

// function CounterSub(countRef, countingData) {
//   countRef.child(countingData).transaction(function(currentValue) {
//     return (currentValue || 0) - 1;
//   });
// }

/*
z
*/

///////////////////////////
// function Criter_Count(snapshot) {
//   var name = snapshot.val();

//   Object.keys(name).forEach(function(parentKey) {
//     // parentKey=data1 name[parentKey]=adana
//     var key = parentKey; //child key
//     var childData = name[parentKey]; //child value
//     console.log("key:" + key + " val:" + childData);
//     var childRef = db.ref("/datas/" + key + "/" + childData).child(pop);

//     childRef.transaction(function(currentValue) {
//       return (currentValue || 0) + 1;
//     });
//   });
// }
////////////////////check Status///////////////////////////////

// function CheckStatus(snapshot) {
//   IfKeyExist(snapshot.key, snapshot.val()); //kontrol için gönderilir
// }

// function CheckStatus(snapshot, context) {
//   const dataid = snapshot.key; // dataid
//   const val = snapshot.val(); // data value

//   //snapshot.forEach(function(childSnapshot) {
//     // var key = childSnapshot.key; //child key
//     // var childData = childSnapshot.val(); //child value
//     //console.log("key:" + key + " val:" + childData);
//     console.log("key:" + dataid + " val:" + val);
//     IfKeyExist(dataid, val);//kontrol için gönderilir

//     //console.log(childSnapshot._path);
//     // db.ref(childSnapshot._path).update({
//     //   code: PushDatas(dataid)
//     // });
//     //console.log(dataid);
//   //});
// }

////////////////////check Status///////////////////////////////

////////////////IfKeyExist inside//////////////////////////////

// db.ref(`/datas/`+keyExistChild).once("value", snapshot => {
//   if (snapshot.exists()) {
//     console.log("exists!");
//     const email = snapshot.val();
//   }
// });

// var rootRef = db.ref("/datas");
// var usersRef = rootRef.child(keyExistChild);
// console.log();
// //console.log(usersRef.isEqual(rootRef));
// console.log(
//   keyExistChild + ":" + usersRef.isEqual(rootRef.child(keyExistChild))
// );

// return usersRef.isEqual(rootRef.child(keyExistChild));
// false
// true
//usersRef.parent.isEqual(rootRef); // true

////////////////http post functions//////////////////////////////
/*
app.post("/", (req, res) => {
  const bodyJson = req.body; // gelen içeriği bir alalım
  console.log(bodyJson.tc);

  return db
    .ref("/") //select a path
    .push(bodyJson) //push data
    .then(() => {
      // HTTP 200 Ok - yani işlem başarılı oldu diyoruz
      return res.status(200).send("Added");
    })
    .catch(err => {
      // İşlem başarısız oldu
      // HTTP 500 Internal server error ile hata mesajını yollayabiliriz
      return res.status(500).send("There is something go wrong " + err);
    });
  //res.send(console.log("there is a post"));
});
*/

/*
// HTTP Get çağrısı gelmesi halinde çalışacak metodumuz
app.get("/", (req, res) => {
  return db.ref("/").on(
    "value",
    snapshot => {
      // HTTP 200 Ok cevabı ile birlikte somedata içeriğini döndürüyoruz
      return res.status(200).send(snapshot.val());
    },
    err => {
      // Bir hata varsa HTTP Internal Server Error mesajı ile birlikte içeriğini döndürüyoruz
      return res.status(500).send("There is something go wrong " + err);
    }
  );
});

// HTTP Post çağrısını veritabanına veri eklemek için kullanacağız
app.post("/", (req, res) => {
  const payload = req.body.dataset; // gelen içeriği bir alalım
  // push metodu ile veriyi yazıyoruz.
  // işlem başarılı olursa then bloğu devreye girecektir
  // bir hata oluşması halinde catch bloğu çalışır
  return db
    .ref("/")
    .push(payload)
    .then(() => {
      // HTTP 200 Ok - yani işlem başarılı oldu diyoruz
      return res.status(200).send("Added");
    })
    .catch(err => {
      // İşlem başarısız oldu
      // HTTP 500 Internal server error ile hata mesajını yollayabiliriz
      return res.status(500).send("There is something go wrong " + err);
    });
});
*/

//update
// var ref = db.ref("/");

// var usersRef = ref.child("users1");
// usersRef.set({
//   alanisawesome: {
//     date_of_birth: "June 23, 191",
//     full_name: "Alan Turing"
//   },
//   gracehop: {
//     date_of_birth: "December 9, 1906",
//     full_name: "Grace Hopper"
//   }
// });

// app.get("/:id", (req, res) => res.send(Somedataa.getById(req.params.id)));
// app.post("/", (req, res) => res.send(Somedataa.create()));
// app.put("/:id", (req, res) =>
//   res.send(Somedataa.update(req.params.id, req.body))
// );
// app.delete("/:id", (req, res) => res.send(Somedataa.delete(req.params.id)));
// app.get("/", (req, res) => res.send(Somedataa.list()));

// Servisten dışarıya açtığımız fonksiyonlar
// somedata fonksiyonumuz için app isimli express nesnemiz ve doğal olarak Get, Post metodları ele alınacak

//firebase emulators:start --only functions,database
// exports.Create_Datas_Collection = functions.database
//   .ref("/members/{memberid}/{dataid}")
//   .onCreate((snapshot, context) => {
//     //console.log("Datas Create inside:  ");
//     IfKeyExist(snapshot.key, snapshot.val()); //creating table
//     return null;
//   });
//////////

///////////////////for datas///////////////////
// exports.Crit_Counter = functions.database
//   .ref("/datas/{critid}")
//   .onCreate((snapshot, context) => {
//     counting(context.params.critid);

//     //IfKeyExist(snapshot.key, snapshot.val()); //creating table
//     return null;
//   });

//////////////sonra yap///////////////////
// exports.trgTryUpdate = functions.database
//   .ref("/members/{memberid}")
//   .onUpdate((change, context) => {
//     console.log("update before inside: " + change.before.val());
//     console.log("update after inside: " + change.after.val());
//     return null;
//   });

//return db;
//   .ref("/datas/data1/count")
//   .once(
//     "value",
//     function(snapshot) {
//       //console.log(snapshot.val());
//       return res.status(200).send("value:" + snapshot.val());
//     },
//     function(errorObject) {
//       console.log("The read failed: " + errorObject.code);
//     }
//   )
//   .catch(err => {
//     // İşlem başarısız oldu
//     // HTTP 500 Internal server error ile hata mesajını yollayabiliriz
//     return res.status(500).send("There is something go wrong " + err);
//   });
///
// app.delete("/", (req, res) => {
//   return db
//     .ref("/")
//     .remove()
//     .then(() => {
//       // HTTP 200 Ok - yani işlem başarılı oldu diyoruz
//       return res.status(200).send("Deleted");
//     })
//     .catch(err => {
//       // İşlem başarısız oldu
//       // HTTP 500 Internal server error ile hata mesajını yollayabiliriz
//       return res.status(500).send("There is something go wrong " + err);
//     });
// });
//////

/*


app.get("/", (req, res) => {
  return db
    .ref("/")
    .once(
      "value",
      function(snapshot) {
        //console.log(snapshot.val());
        var sumSubData = 0;
        var datas = snapshot.val();

        datas.forEach(dataX => {
          dataX.forEach(subData => {
            sumSubData += subData.rate;
          });
        });
        //var kriterort = sumSubData

        return res.status(200).send("value:" + sumSubData);
      },
      function(errorObject) {
        console.log("The read failed: " + errorObject.code);
      }
    )
    .catch(err => {
      // İşlem başarısız oldu
      // HTTP 500 Internal server error ile hata mesajını yollayabiliriz
      return res.status(500).send("There is something go wrong " + err);
    });

  //
});

 */

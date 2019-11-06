"use strict";

const FILL_SIZE = 350;
let provinceMap = null, politicalMap = null;
let mapX = -2500, mapY = -300, annexMode = 0, pLastTime = 0, cLastTime = 0, myCountry = null, targetCountry = null;
let selectingProvince = null;
let ctx, canvasDC, scale = 1, map;
const namelist = sqlRequest("SELECT (SELECT ROUND(COALESCE(AVG(x),0)) FROM province WHERE province.countryId=country.countryId) as x, (SELECT ROUND(COALESCE(AVG(y),0)) FROM province WHERE province.countryId=country.countryId) as y, name, (SELECT count(*) FROM province WHERE province.countryId=country.countryId) as province FROM country");

onload = () => {
    //canvas初期化
    const canvas = document.getElementById("canvas");
    ctx = canvas.getContext('2d');
    map = document.getElementById("politicalMap");

    //最新の地図を取得
    //DB上には政治地図画像ファイルの最終更新日時を登録しておく
    //DBさえ更新すればつねに最新に近い地図が手に入る
    const politicalMapLastUpdateDB = sqlRequest("SELECT * FROM info")[0].politicalMapLastUpdate;
    document.getElementById("politicalMap").src = "img/politicalMap.png?r=" + new Date(politicalMapLastUpdateDB).getTime();

    document.getElementById("politicalMap").onload = () => {
        //プロヴィンスマップと白地図を取得
        provinceMap = new ImageDataController(document.getElementById("provinceMap"));
        politicalMap = new ImageDataController(document.getElementById("politicalMap"));

        //canvas要素に対してドラッグを可能にします
        canvasDC = new DragController(canvas, () => {
            fillstart(canvasDC.startMouseX - canvas.offsetLeft, canvasDC.startMouseY - canvas.offsetTop)
        }, () => {
            mapX += (canvasDC.latestMouseX - canvasDC.oldMouseX) / scale;
            mapY += (canvasDC.latestMouseY - canvasDC.oldMouseY) / scale;
            fixMapOffset();
        });

        //ランダムな色を設定
        document.getElementById("color").value = "#" + Math.floor(Math.random() * 256).toString(16) + Math.floor(Math.random() * 256).toString(16) + Math.floor(Math.random() * 256).toString(16);

        //UIのサイズ調整
        {
            const targetCountryFlag = document.getElementById("targetCountryFlag");
            targetCountryFlag.height = Math.round(targetCountryFlag.width * 0.67); //横：縦=3:2
            document.getElementById("middle").style.height = window.innerHeight - document.getElementById("header").offsetHeight + "px"; //ミドルを可能な限り縦に伸ばす
            //ウィンドウ幅の7割を地図表示領域とする
            canvas.width = Math.floor(document.getElementById("middle").offsetWidth * 0.88);
            canvas.height = Math.floor(window.innerHeight * 0.7);
        }

        //地図生成
        pLastTime = now();
        cLastTime = now();

        for (const i of sqlRequest("SELECT x,y,country.r,country.g,country.b FROM province INNER JOIN country ON province.countryId=country.countryId WHERE province.timestamp>'" + politicalMapLastUpdateDB + "'")) {
            politicalMap.fill(provinceMap, parseInt(i.x), parseInt(i.y), parseInt(i.r), parseInt(i.g), parseInt(i.b));
        }
        ctx.drawImage(politicalMap.updateCanvas(true), mapX, mapY);

        setInterval(() => {
            //地図更新
            let responce = sqlRequest("SELECT x,y,r,g,b FROM (SELECT x,y,countryId FROM province where timestamp>" + pLastTime + " ORDER BY timestamp DESC) AS province2 INNER JOIN country ON province2.countryId=country.countryId");
            if (responce.length >= 1) { //プロヴィンスに関して更新があったら
                if (responce.length > -1) pLastTime = now(); //responceと無理やり同期させる
                console.log("更新あり！");
                console.log(responce);
                for (const i of responce) {
                    politicalMap.fill(provinceMap, parseInt(i.x), parseInt(i.y), parseInt(i.r), parseInt(i.g), parseInt(i.b));
                }
                ctx.drawImage(politicalMap.updateCanvas(true), mapX, mapY);
            }

            //国情報更新
            if (myCountry != null) { //自国が選択済みならば
                const responce = sqlRequest("SELECT money FROM country WHERE countryId=" + myCountry.id + " AND timestamp>" + cLastTime);
                if (responce.length < 1) return;
                if (responce.length > -1) cLastTime = now(); //responceと無理やり同期させる
                console.log(responce);
                for (const i of responce) {
                    document.getElementById("money").innerText = i.money;
                }
            }
        }, 10000);
    }
}

function fillstart(mouseX, mouseY) {
    const x = Math.floor(mouseX / scale - mapX), y = Math.floor(mouseY / scale - mapY);
    let [r, g, b] = provinceMap.getColor(x, y);
    if (r == 0 && g == 0 && b == 0) return; //境界線をクリックした場合は以前のマスを選択したままになる

    //選択しているマスを入れ替え
    //x,yにはマップ上での座標が代入されます
    const pastSelectedProvince = selectingProvince;
    selectingProvince = new Province(x, y, r, g, b);

    let owner = null;

    if (pastSelectedProvince != null) { //以前選択していたプロビンスがある場合は、そのプロビンスと今選択しているプロビンスの領有国情報をまとめて取得
        let oldProvinceOwner = null;
        for (const i of sqlRequest("SELECT *,'first' FROM country WHERE countryId=(SELECT countryId FROM province WHERE r=" + pastSelectedProvince.r + " AND g=" + pastSelectedProvince.g + " AND b=" + pastSelectedProvince.b + ") UNION SELECT *,'second' FROM country WHERE countryId=(SELECT countryId FROM province WHERE r=" + selectingProvince.r + " AND g=" + selectingProvince.g + " AND b=" + selectingProvince.b + ")")) {
            if (i.first === "first") oldProvinceOwner = i;
            else if (i.first === "second") owner = i;
        }
        if (oldProvinceOwner !== null) politicalMap.fill(provinceMap, pastSelectedProvince.x, pastSelectedProvince.y, oldProvinceOwner.r, oldProvinceOwner.g, oldProvinceOwner.b);
        else politicalMap.fill(provinceMap, pastSelectedProvince.x, pastSelectedProvince.y, 255, 255, 255);
    } else {
        owner = selectingProvince.getOwner();
    }

    //併合モードが有効な場合は併合します
    if (annexMode == 1) myCountry.annexProvince(selectingProvince);
    else politicalMap.fill(provinceMap, x, y, 255, 0, 0); //併合モードが有効でない場合はマスを赤く塗る

    //地図を更新します
    ctx.drawImage(politicalMap.updateCanvas(true), mapX, mapY);

    //選択しているマスの情報を表示する
    if (owner === null) {
        targetCountry = null;
        document.getElementById("targetCountryFlag").src = "img/255.255.255.png";
        document.getElementById("targetCountryName").innerText = "領有国なし";
        document.getElementById("targetMoney").innerText = "???";
        document.getElementById("targetMilitary").innerText = "???";
        document.getElementById("create").disabled = false;
        document.getElementById("select").disabled = true;
        document.getElementById("declareWar").disabled = true;
        document.getElementById("changeName").disabled = true;
        return;
    }
    targetCountry = new Country(owner);
    document.getElementById("create").disabled = false;
    document.getElementById("select").disabled = false;
    document.getElementById("targetCountryFlag").src = "img/" + owner.countryId + ".png";
    document.getElementById("targetCountryName").innerText = owner.name;
    document.getElementById("targetMoney").innerText = owner.money;
    document.getElementById("targetMilitary").innerText = owner.military;
    document.getElementById("changeName").disabled = false;
    if (myCountry !== null && myCountry.id !== targetCountry.id) document.getElementById("declareWar").disabled = false;
    else document.getElementById("declareWar").disabled = true;
}

function switchAnnexMode() {
    if (myCountry == null) return; //国が未選択だったら何もしない
    annexMode = 1 - annexMode;
    //console.log(annexMode);
    if (annexMode === 1) {
        document.getElementById("annex").innerText = "併合中止";
        return;
    }
    document.getElementById("annex").innerText = "併合開始";
}

function now() { //yyyymmddhhmmss形式の現在の日付時刻を取得
    const time = new Date();
    let month = time.getMonth() + 1;
    if (month < 10) month = "0" + month;
    let date = time.getDate();
    if (date < 10) date = "0" + date;
    let hour = time.getHours();
    if (hour < 10) hour = "0" + hour;
    let minute = time.getMinutes();
    if (minute < 10) minute = "0" + minute;
    let second = time.getSeconds();
    if (second < 10) second = "0" + second;
    return "" + time.getFullYear() + month + date + hour + minute + second;
}

function requestPhp(command, path, data) {
    const request = new XMLHttpRequest();
    request.open("POST", "main.php", false);
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    request.send("command=" + command + "&path=" + path + "&data=" + data);
    return request.responseText;
}

function sqlRequest(state = "") {
    const startTime = (new Date).getTime();
    const result = requestPhp("sql", "", state).split("error")[0].split("\n"); //なぜかついてくるerrorを除去
    let list = [];
    for (let i = 0; i < result.length - 1; i++) { //配列の最後は空行なので飛ばす
        list.push(JSON.parse(result[i]));
    }
    console.log("リクエスト処理：" + (((new Date).getTime() - startTime) / 1000) + "秒");
    return list;
}

function test() {
    //console.log("自国の色：" + myCountry.r + "." + myCountry.g + "." + myCountry.b);
    //politicalMap.download();
    //resize(1, 1);
    //localStorage.clear();
    //console.log(sqlRequest("SELECT * FROM war"));
    //最新のプロヴィンス情報を取得↓
    //SELECT * FROM province ORDER BY timestamp desc limit 3;
    //UPDATE province SET countryId=2,timestamp=NOW() WHERE r=207 AND g=223 AND b=223;
    //SELECT countryId,name from country order by countryId desc limit 3
    //(Math.floor(Math.random() * 40) + 1)
    sqlRequest("UPDATE info SET politicalMapLastUpdate='1900/01/01 01:00:00'");
}

//地図の拡大率を変更します
function resize(scaleArg) {
    if (scale <= 0.5 && scaleArg < 1) return;
    scale *= scaleArg;
    console.log("scale=" + scale);
    ctx.scale(scaleArg, scaleArg);
    fixMapOffset();
}

//表示されている地図のオフセットを修正します
function fixMapOffset() {
    if (mapX > 0) mapX = 0;
    else if ((mapX + map.width) * scale < canvas.width) mapX = canvas.width / scale - map.width;
    if (mapY > 0) mapY = 0;
    else if ((mapY + map.height) * scale < canvas.height) mapY = canvas.height / scale - map.height;
    ctx.drawImage(politicalMap.canvas, mapX, mapY);
}

//サーバー上の地図画像を更新します
function updateMapFile() {
    requestPhp("updateImg", "./img/politicalMap.png", politicalMap.getDataURL());
    //データベース上に登録されている政治地図ファイル最終更新日時を更新
    sqlRequest("UPDATE info SET politicalMapLastUpdate=NOW()");
}

class Province {
    //座標はマップ上の座標です
    constructor(x = 0, y = 0, r = 255, g = 255, b = 255) {
        this.x = x;
        this.y = y;
        this.r = r;
        this.g = g;
        this.b = b;
    }

    getOwner() {
        const responce = sqlRequest("SELECT * FROM country WHERE countryId=(SELECT countryId FROM province WHERE r=" + this.r + " AND g=" + this.g + " AND b=" + this.b + ")");
        if (responce.length < 1) return null; //国が見つからなかった時
        return responce[0];
    }

    isOwned() {
        return this.getOwner() != null;
    }

    createCountry() {
        const color = document.getElementById("color").value;
        const r = parseInt(color.substring(1, 3), 16);
        const g = parseInt(color.substring(3, 5), 16);
        const b = parseInt(color.substring(5, 7), 16);
        if (sqlRequest("SELECT * FROM country WHERE (r=" + r + " AND g=" + g + " AND b=" + b).length > 0) {
            alert("同じ色か同じ名前を使用している国家が既に存在します");
            return;
        }
        sqlRequest("INSERT INTO `country` (`name`, `r`, `g`, `b`, `money`, `timestamp`) VALUES ('" + document.getElementById("mcName").value + "', " + r + ", " + g + ", " + b + " , 0, NOW())");
        const country = new Country(sqlRequest("SELECT * from country order by countryId desc limit 1")[0]); //最新のidを取得
        country.annexProvince(this);
        politicalMap.fill(provinceMap, this.x, this.x, r, g, b);
        ctx.drawImage(politicalMap.updateCanvas(true), mapX, mapY);
        return country;
    }
}

class Country {
    constructor(sqlResponceObject) {
        this.id = sqlResponceObject.countryId;
        this.name = sqlResponceObject.name;
        this.r = sqlResponceObject.r;
        this.g = sqlResponceObject.g;
        this.b = sqlResponceObject.b;
        this.money = sqlResponceObject.money;
        this.military = sqlResponceObject.military;
    }

    expandArmy() { //軍を拡大
        document.getElementById("military").innerText = ++this.military;
        document.getElementById("disarm").disabled = false;
        sqlRequest("UPDATE country SET timestamp=NOW(),military=" + this.military + " WHERE countryId=" + this.id);
    }

    disarm() { //軍縮
        if (this.military <= 0) {
            document.getElementById("text").innerText = "これ以上軍縮はできません";
            document.getElementById("disarm").disabled = true;
            return;
        }
        document.getElementById("military").innerText = --this.military;
        sqlRequest("UPDATE country SET timestamp=NOW(),military=" + this.military + " WHERE countryId=" + this.id);
    }

    declareWar(target) { //宣戦布告
        if (target.id == null || this.id == target.id) return; //対象が存在しないか、自国が存在しなければ宣戦布告はできない
        const request = sqlRequest("SELECT * FROM war WHERE ((countryIdA='" + this.id + "' AND countryIdB='" + target.id + "') OR (countryIdA='" + target.id + "'AND countryIdB='" + this.id + "'))");
        console.log(request);
        if (request.length > 0) {
            document.getElementById("text").innerText = "すでに戦争状態です。";
            return;
        }
        document.getElementById("text").innerText = "宣戦布告しました！";
        sqlRequest("INSERT INTO war VALUES (" + this.id + "," + target.id + ")");
    }

    //国を自国として設定します
    select() {
        myCountry = this;
        document.getElementById("text").innerText = "外交の時間だ！"
        document.getElementById("myCountryFlag").src = "img/" + this.id + ".png";
        document.getElementById("myCountryName").innerText = this.name;
        document.getElementById("money").innerText = this.money;
        document.getElementById("military").innerText = this.military;
        document.getElementById("expandArmy").disabled = false;
        document.getElementById("disarm").disabled = false;
        document.getElementById("annex").disabled = false;
    }

    annexProvince(province) { //選択しているマスを選択している国で併合します
        if (province == null) return;
        if (province.isOwned()) {
            sqlRequest("UPDATE province SET countryId=" + this.id + ",timestamp=NOW() WHERE r=" + province.r + " AND g=" + province.g + " AND b=" + province.b);
        } else {
            sqlRequest("INSERT INTO `province` (`x`, `y`, `r`, `g`, `b`, `timestamp`, `countryId`) VALUES (" + province.x + ", " + province.y + ", " + province.r + ", " + province.g + ", " + province.b + ", NOW(), " + this.id + ")");
        }
        politicalMap.fill(provinceMap, province.x, province.y, this.r, this.g, this.b);
    }

    setName(name) {
        if (name == null) {
            //nullが渡された時はinput要素から国名を取得します
            name = document.getElementById("mcName").value;
        }
        this.name = name;
        document.getElementById("targetCountryName").innerText = name;
        sqlRequest("UPDATE country SET name='" + name + "', timestamp=NOW() WHERE countryId=" + this.id);
    }
}

class ImageDataController {
    //imageData:操作対象のimageDataオブジェクト
    //canvas:内部キャンバス
    //ctx:内部キャンバスのコンテキスト
    constructor(img) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = img.naturalWidth;
        this.canvas.height = img.naturalHeight;
        this.ctx = this.canvas.getContext('2d');
        this.ctx.drawImage(img, 0, 0);
        this.imageData = this.ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
    }

    getPixelOffset(x, y) { //座標からデータが格納されている番号を取得します
        return (x + this.imageData.width * y) * 4;
    }

    getColor(x, y) { //座標からピクセルの色を取得します
        const n = this.getPixelOffset(x, y);
        return [this.imageData.data[n], this.imageData.data[n + 1], this.imageData.data[n + 2]];
    }

    setColor(x, y, r, g, b) { //座標に色を設定します
        const n = this.getPixelOffset(x, y);
        this.imageData.data[n] = r;
        this.imageData.data[n + 1] = g;
        this.imageData.data[n + 2] = b;
    }

    checkColor(x, y, r, g, b) { //座標が指定された色か確認します
        const n = this.getPixelOffset(x, y);
        return this.imageData.data[n] === r && this.imageData.data[n + 1] === g && this.imageData.data[n + 2] === b;
    }

    fill(reference, centerX, centerY, r, g, b) {
        if (this.checkColor(centerX, centerY, r, g, b) || this.checkColor(centerX, centerY, 0, 0, 0)) return; //既に塗られているか、線を選択したら戻る
        const [startPixelR, startPixelG, startPixelB] = reference.getColor(centerX, centerY);
        for (let y = centerY - FILL_SIZE; y < centerY + FILL_SIZE; y++) {
            for (let x = centerX - FILL_SIZE; x < centerX + FILL_SIZE; x++) {
                if (reference.checkColor(x, y, startPixelR, startPixelG, startPixelB)) {
                    this.setColor(x, y, r, g, b);
                }
            }
        }
    }

    updateCanvas(isDrawText) {
        //内部キャンバスのデータを更新し、それを返します
        this.ctx.putImageData(this.imageData, 0, 0);

        //国名を表示
        if (isDrawText) {
            this.ctx.textAlign = "center";
            for (const i of namelist) {
                this.ctx.font = Math.ceil(128 / i.name.length) * Math.ceil(i.province / 64) + "px serif";
                this.ctx.fillText(i.name, parseInt(i.x), parseInt(i.y));
            }
        }

        return this.canvas;
    }

    download() {
        let link = document.createElement("a");
        link.href = this.getDataURL();
        link.download = "politicalMap.png";
        link.click();
    }

    //地図を発行します
    getDataURL() {
        //マスを選択済みだったら元の色に戻す
        if (selectingProvince != null) {
            const owner = selectingProvince.getOwner();
            if (owner !== null) this.fill(provinceMap, selectingProvince.x, selectingProvince.y, owner.r, owner.g, owner.b);
            else this.fill(provinceMap, selectingProvince.x, selectingProvince.y, 255, 255, 255);
        }
        return this.updateCanvas(false).toDataURL("image/png");
    }
}

//ドラッグ操作を提供するクラス
class DragController {
    //element:ドラッグ管理対象のエレメント
    //startFunc:クリック時に実行する関数
    //dragFunc:ドラッグ時に実行する関数
    //startMouseX,startMouseY:ドラッグ開始時のマウス座標
    //latestMouseX,latestMouseY:最新のマウス座標
    //oldMouseX,oldMouseY:ドラッグイベント1つ前のマウス座標
    //isDragging
    constructor(element, startFunc = () => { }, dragFunc = () => { }) {
        this.element = element;
        this.startFunc = startFunc;
        this.dragFunc = dragFunc;
        element.addEventListener("mousedown", this.start);
        element.addEventListener("touchstart", this.start);
        self = this;
    }

    start(e) {
        e.preventDefault();
        if (e.type !== "mousedown") e = e.changedTouches[0];
        self.startMouseX = Math.round(e.pageX);
        self.startMouseY = Math.round(e.pageY);
        self.oldMouseX = self.startMouseX;
        self.oldMouseY = self.startMouseY;
        self.latestMouseX = self.startMouseX;
        self.latestMouseY = self.startMouseY;
        self.isDragging = true;

        self.element.addEventListener("mousemove", self.drag);
        self.element.addEventListener("touchmove", self.drag);
        self.element.addEventListener("mouseup", self.end);
        self.element.addEventListener("touchend", self.end);
        self.element.addEventListener("mouseleave", self.end);
        self.element.addEventListener("touchcancel", self.end);

        self.startFunc();
    }

    drag(e) {
        if (!self.isDragging) return;
        e.preventDefault();
        if (e.type !== "mousemove") e = e.changedTouches[0];
        self.latestMouseX = Math.round(e.pageX);
        self.latestMouseY = Math.round(e.pageY);
        self.dragFunc();
        self.oldMouseX = self.latestMouseX;
        self.oldMouseY = self.latestMouseY;
    }

    end(e) {
        e.preventDefault();
        self.isDragging = false;
        self.element.removeEventListener("mousemove", self.drag);
        self.element.removeEventListener("touchmove", self.drag);
        self.element.removeEventListener("mouseup", self.end);
        self.element.removeEventListener("touchend", self.end);
        self.element.removeEventListener("mouseleave", self.end);
        self.element.removeEventListener("touchcancel", self.end);
    }
}
/**
 * AJAX long-polling
 *
 * 1. sends a request to the server (without a timestamp parameter)
 * 2. waits for an answer from server.php (which can take forever)
 * 3. if server.php responds (whenever), put data_from_file into #response
 * 4. and call the function again
 *
 * @param timestamp
 */

const name = prompt('名前を入力してください');

text = null
function getContent(timestamp) {
    var queryString = { 'timestamp': timestamp };

    $.ajax(
        {
            type: 'GET',
            url: 'http://volga.e3.valueserver.jp/VolgaChat/server3.php',
            data: queryString,
            success: function (data) {
                // put result data into "obj"
                var obj = jQuery.parseJSON(data);
                // put the data_from_file into #response
                //document.getElementById('response').innerText = obj.data_from_file + document.getElementById('response').innerText;
                $('#response').html(obj.data_from_file);
                // call the function again, this time with the timestamp we just got from server.php
                getContent(obj.timestamp);
            }
        }
    );
}

// initialize jQuery
$(function () {
    getContent();
});

console.log('hihihih')

let request = null;

function get() {
    console.log('get')
    request = new XMLHttpRequest();
    const time = new Date().toLocaleString();
    const url = "server3.php?timestamp=" + new Date().getTime() + '&text=' + encodeURIComponent(text) + '&name=' + name + '&time=' + time;
    request.open("GET", url, true);
    request.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    //request.send("timestamp=" + new Date().getTime());
    request.send(null);
}

function sub() {
    console.log('sub');
    text = document.getElementById('text').value;
    document.getElementById('text').value = '';
    console.log(text);
    get();
    text = null
}

//get();
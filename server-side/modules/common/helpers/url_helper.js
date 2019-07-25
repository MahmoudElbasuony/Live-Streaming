const urlParser = require('url');

/**
 * get value by a key from url 
 * @param {*} url url to get query string from 
 * @param {*} key the key you ant to get its value 
 */
function getValueFromQueryString(url, key) {
    let parsedUrl = urlParser.parse(url, true);
    return parsedUrl.query[key];
}



module.exports = {
    getValueFromQueryString
}
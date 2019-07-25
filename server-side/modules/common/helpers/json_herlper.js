/**
 * convert json to javascript object 
 * @param {*} objStr json string  to be converted to javascript object 
 */
function getObjectFromJson(objStr){
    try{
        let obj = JSON.parse(objStr);
        return obj || {};
    }
    catch{
        return console.error('invalid data to parse ');
    }
}


module.exports =  { getObjectFromJson };
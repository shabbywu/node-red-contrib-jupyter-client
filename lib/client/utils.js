function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safe_json_dump (data) {
    return JSON.stringify(data);
}

module.exports = {
    sleep,
    safe_json_dump,
}

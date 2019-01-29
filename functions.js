var trim = function (string, char) {
    if (!char) char = ' '; //space by default
    char = char.replace(/([()[{*+.$^\\|?])/g, '\\$1'); //escape char parameter if needed for regex syntax.
    var regex_1 = new RegExp("^" + char + "+", "g");
    var regex_2 = new RegExp(char + "+$", "g");
    return string.replace(regex_1, '').replace(regex_2, '');
};

module.exports = {
    trim: trim,
};
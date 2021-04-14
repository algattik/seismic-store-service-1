const replace = require('replace-in-file');
const options_clear = {
    files: 'node_modules/swagger-ui-dist/swagger-ui.css',
    from: '.swagger-ui .topbar{display:\'none\';',
    to: '.swagger-ui .topbar{',
};
const options_add_display = {
    files: 'node_modules/swagger-ui-dist/swagger-ui.css',
    from: '.swagger-ui .topbar{',
    to: '.swagger-ui .topbar{display:\'none\';',
};
try {
    var results = replace.sync(options_clear);
    console.log('Replacement results:', results);
    results = replace.sync(options_add_display);
    console.log('Replacement results:', results);
}
catch (error) {
    console.error('Error occurred:', error);
}
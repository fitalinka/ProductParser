const db = require('./db');
const functions = require('./functions');
const sitemapParser = require('sitemap-stream-parser');
const _ = require('underscore');
const request = require('request');
const csvParser = require('csv');
const iconv = require('iconv-lite');

function Parser() {
    this.domainList = [];
    this.totalDomains = 0;
    this.protocolPrefix = 'http://';

    this.typeSkanParser = 1;
    this.typeSkanFile = 2;
    this.typeSkanNotParse = 3;
    this.typeSkanWithoutSitemap = 4;

    this.statusProcessingSuccess = 1;
    this.statusProcessingSitemapNotSet = 401;
    this.statusProcessingSitemapNotFound = 402;
    this.statusProcessingPriceFileUrlNotSet = 403;
    this.statusProcessingLinksNotFound = 404;
    this.statusProcessingError = 500;

    this.searchParams = {
        status: 0,
        // status_skan: this.typeSkanParser
    };
}

/**
 * Start parsing
 */
Parser.prototype.run = function () {
    var _this = this;
    _this.getDomainList();
};

/**
 * Get a list of domains from the database
 */
Parser.prototype.getDomainList = function () {
    var _this = this;
    var _searchParams = _this.searchParams;
    var sql = `SELECT * FROM \`domain\``;
    
    if (!_.isEmpty(_searchParams)) {
        var paramsPartArray = [];
        _.each(_searchParams, function (value, key) {
            paramsPartArray.push(`\`${key}\` = '${value}'`);
        });
        sql += ` WHERE ` + paramsPartArray.join(` AND `);
    }

    var query = db.query(sql, function (error, rows) {
        if (error) throw error;
        _this.totalDomains = rows.length;
        _this.domainList = rows;
        
        if (_this.totalDomains > 0) {
            _this.processingDomain(0);
        } else {
            console.log('Domains not found!!!');
            db.end();
            process.exit(-1);
        }
    });
};

/**
 * Domain sorting and processing function
 *
 * @param {number} domainIndex - index current domain
 */
Parser.prototype.processingDomain = function (domainIndex) {
    var _this = this;
    var domain = _this.domainList[domainIndex];

    if (domain === undefined) {
        console.log('Parsing finished');
        process.exit(-1);
    }

    console.log(`Start processing domain - ${domain.name} ------ ${domainIndex + 1} из ${_this.totalDomains}`);

    switch (domain.status_skan) {
        case _this.typeSkanParser:
            _this.getLinksDomainWithSitemap(domainIndex);
            break;
        case _this.typeSkanFile:
            _this.getLinksDomainFromFile(domainIndex);
            break;
        case _this.typeSkanWithoutSitemap:
            _this.getLinksDomainWithoutSitemap(domainIndex);
            break;
        case _this.typeSkanNotParse:
            _this.processingDomain(++domainIndex);
            break;
    }
};

/**
 * Get a list of links from domain with sitemap usage
 * 
 * @param {number} domainIndex - index current domain
 */
Parser.prototype.getLinksDomainWithSitemap = function (domainIndex) {
    var _this = this;
    var domain = _this.domainList[domainIndex];
    var domainUrl = _this.protocolPrefix + domain.name;

    console.log(`Processing domain - ${domain.name} with sitemap`);
    
    if (!_.isEmpty(domain.sitemap_url)) {
        console.log(domain.sitemap_url);
        _this.processingSitemap(domainIndex, [domain.sitemap_url]);
    } else {
        _this.endProcessingDomain(domainIndex, _this.statusProcessingSitemapNotSet)
    }
};

/**
 * Get a list of links from domain without sitemap
 *
 * @param {number} domainIndex - index current domain
 */
Parser.prototype.getLinksDomainWithoutSitemap = function (domainIndex) {
    var _this = this;
    var domain = _this.domainList[domainIndex];
    var domainUrl = _this.protocolPrefix + domain.name;

    console.log(`Processing domain - ${domain.name} without sitemap`);

    sitemapParser.sitemapsInRobots(domainUrl + '/robots.txt', function (error, urls) {
        if (error || !urls || urls.length === 0) {
            console.log("EXIT NO URLS", error, urls);
            _this.endProcessingDomain(domainIndex, _this.statusProcessingSitemapNotFound);
            return;
        }

        _this.processingSitemap(domainIndex, urls);
    });
};

/**
 * Processing sitemap
 * 
 * @param {number} domainIndex - index current domain
 * @param {array} sitemaps - list of sitemaps
 */
Parser.prototype.processingSitemap = function(domainIndex, sitemaps) {
    var _this = this;
    var domain = _this.domainList[domainIndex];

    var matchingLinks = [];
    var transformedUrls = [];
    _.each(sitemaps, function (url) {
        url = url.split('://')[1];
        url = functions.trim(url, '/');
        transformedUrls.push(`http://${url}`);
    });

    var matchWordsArray = [];
    if (!_.isEmpty(domain.words)) {
        domain.words = domain.words.replace(/\s+/g, '');
        matchWordsArray = domain.words.split(',');
    }
    
    sitemapParser.parseSitemaps(transformedUrls, function (link) {
        var pos = -1;
        var counter = 0;
        while ((pos = link.indexOf('/', pos + 1)) != -1) {
            counter++;
            if (counter === 3) break;
        }
        var searchLink = link.substr(pos);
        if (!_.isEmpty(matchWordsArray)) {
            _.each(matchWordsArray, function (word) {
                if (searchLink.indexOf(word) + 1) matchingLinks.push(link);
            });
        } else {
            matchingLinks.push(link);
        }
    }, function (error, sitemaps) {
        if (error) {
            console.log(`ERROR SITEMAPS:`, error);
        }
        console.log(`SITEMAPS:`, sitemaps);
        _this.writeLinksInDatabase(matchingLinks, domainIndex);
    });
};

/**
 * Get a list of links from domain with file usage
 *
 * @param {number} domainIndex - index current domain
 */
Parser.prototype.getLinksDomainFromFile = function (domainIndex) {
    var _this = this;
    var domain = _this.domainList[domainIndex];

    console.log(`Processing domain - ${domain.name} with file`);

    if (!_.isEmpty(domain.price_file_url)) {
        console.log(domain.price_file_url);
        // console.log(iconv.encode(domain.price_file_url, 'utf8'));


        request.get(domain.price_file_url, function (error, response, body) {
            console.log(error);
            console.log(body);
        });

    } else {
        _this.endProcessingDomain(domainIndex, _this.statusProcessingPriceFileUrlNotSet)
    }
};

/**
 * Write domain links in database
 *
 * @param {array} links - links list of domain
 * @param {number} domainIndex - index current domain
 */
Parser.prototype.writeLinksInDatabase = function(links, domainIndex) {
    var _this = this;
    var domain = _this.domainList[domainIndex];

    if (!_.isEmpty(links)) {
        var sql = 'INSERT IGNORE INTO `link` (name, domain_id) VALUES ?';
        var values = [];
        _.each(links, function (link) {
            values.push([link, domain.id]);
        });
        var query = db.query(sql, [values], function (error, result) {
            if (error) {
                console.log(`ERROR QUERY:`, error);
            }
            console.log(`RESULT QUERY:`, result);
            _this.endProcessingDomain(domainIndex, _this.statusProcessingSuccess);
        });
    } else {
        _this.endProcessingDomain(domainIndex, _this.statusProcessingLinksNotFound);
    }
};

/**
 * End processing domain with write status in database and run processing next domain
 *
 * @param {number} domainIndex - index current domain
 * @param {number} statusProcessing - status processing of current domain
 */
Parser.prototype.endProcessingDomain = function (domainIndex, statusProcessing) {
    var _this = this;
    var domain = _this.domainList[domainIndex];
    var sql = `UPDATE \`domain\` SET \`status\` = '${statusProcessing}', date_skan = NOW() WHERE \`id\` = '${domain.id}'`;
    var query = db.query(sql, function (error, result) {
        if (error) {
            console.log(`ERROR QUERY:`, error);
        }
        console.log(`RESULT QUERY:`, result);
        _this.processingDomain(++domainIndex);
    });
};

var parser = new Parser();
parser.run();

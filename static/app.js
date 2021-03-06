// showdown convertor is included in the HTML from a CDN
const converter = new showdown.Converter();
function convertMarkdown(md) {
  md = md.replace(/```.*/g, '```'); // remove GH taste (```html etc)
  return converter.makeHtml(md);
}
function escapeHTML(html) {
  return document
    .createElement('div')
    .appendChild(document.createTextNode(html)).parentNode.innerHTML;
}

function isRead(item) {
  const isRead = localStorage.getItem(item);
  if (isRead) {
    return true;
  }
  return false;
}

function fetchOrFailOverToCache() {
  return new Promise(function(resolve, reject) {
    fetch('/data.json')
      .then(res => res.json())
      .then(data => {
        if (data && data.date) {
          localStorage.setItem('whole-data', JSON.stringify(data));
          resolve(data);
        } else {
          const data = JSON.parse(localStorage.getItem('whole-data'));
          if (data && data.length) {
            resolve(data);
          } else {
            reject();
          }
        }
      });
  });
}

fetchOrFailOverToCache()
  .then(data => {
    let orgs = {};
    let releases = data.releases;
    const tenYearsAgo = 3600 * 24 * 30 * 365 * 10 * 1000;
    for (const release of releases) {
      release.read = isRead(release.hash);
      const orgName = release.repoName.substr(0, release.repoName.indexOf('/'));
      if (!orgs[orgName]) {
        // create a new org
        orgs[orgName] = {
          orgName,
          disabled: JSON.parse(
            localStorage.getItem(`is-${orgName}-org-disabled`)
          )
        };
      }
      release.org = orgs[orgName];
      /*
      for unread items, this will not change anything since (false * N = 0),
      but for read items it will throw them 10 years back, so they:
      1) fall below when sorting
      2) preserve their order compared to other read items
      */
      release.published_at_unix_ts =
        release.published_at_unix_ts - release.read * tenYearsAgo;
    }
    releases = releases.sort(
      (a, b) => b.published_at_unix_ts - a.published_at_unix_ts
    );
    new Vue({
      el: '#app',
      computed: {
        releases: function() {
          // `this` points to the vue instance
          return this.releasesAll.filter(
            x =>
              !x.org.disabled &&
              (!this.searchCriteria /* don't search of criteria is empty */ ||
                x.repoName.includes(this.searchCriteria))
          );
        }
      },
      data: {
        orgs,
        releasesAll: releases,
        updatedOn: data.date,
        appLoaded: true,
        searchCriteria: ''
      },
      methods: {
        toggleOrg(org) {
          const checkboxChecked = event.target.checked;
          org.disabled = !checkboxChecked;
          localStorage.setItem(
            `is-${org.orgName}-org-disabled`,
            !checkboxChecked
          );
        },
        updateSearchCriteria(e) {
          // debounce
          clearTimeout(this.inputTimeout || 0);
          this.inputTimeout = setTimeout(() => {
            this.searchCriteria = e.target.value;
          }, 100);
        },
        formatDate(str) {
          const date = new Date(str);
          return date.toLocaleDateString('en-GB');
        },
        setAsRead(release) {
          release.read = true;
          localStorage.setItem(release.hash, true);
        },
        markAllAsRead() {
          const newReleases = [];
          for (const release of this.releasesAll) {
            this.setAsRead(release);
            newReleases.push(release);
          }
          this.releasesAll = newReleases;
        }
      }
    });
  })
  .catch(e => {
    // the VM was killed by now.sh, now it's up but there is no cached data yet, display an apology
    document.querySelector('.overlay').innerHTML = '{{overlayMessage}}';
    
    new Vue({
      el: '.overlay',
      mounted: function() {
        setInterval(() => {
          this.timeLeft--;
          if(this.timeLeft < 1) {
            window.location.reload();
          }
        }, 1000);        
      },
      computed: {
        overlayMessage: function() {
          return `Oops, it seems like you visited the site when it hasn't been visited for a long time, it will need 30 seconds to collect the data. I'll refresh in ${this.timeLeft} seconds...`
        }
      }, 
      data: {               
        timeLeft: 30,
        appLoaded: false
      }
    });
  });

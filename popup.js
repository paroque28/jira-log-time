document.addEventListener('DOMContentLoaded', onDOMContentLoaded, false);

function onDOMContentLoaded() {

    chrome.storage.sync.get({
            username: '',
            password: '',
            description: '',
            baseUrl: '',
            apiExtension: '',
            jql: ''
        },
        init);

    function orderByParent(issues){
        var sorted = [];
        for (var i in issues){
            var issue = issues[i];
            switch(issue.fields.issuetype.name) {
                case 'Sub-Task':
                  break;
                case 'Story':
                    sorted.push(issue);
                    for (var j in issues){
                        var issuesub = issues[j];
                        if(issuesub.fields.parent){
                            if(issuesub.fields.parent.key === issue.key){
                                sorted.push(issuesub);
                            }
                        }
                    }
                    break;
                default:
                  sorted.push(issue);
              }
        }
        return sorted;
    }

    /*************
    Initialization
    *************/

    function init(options) {

        // mandatory fields check
        if (!options.username) {
            return errorMessage('Missing username');
        }
        if (!options.password) {
            return errorMessage('Missing password');
        }
        if (!options.baseUrl) {
            return errorMessage('Missing base URL');
        }
        if (!options.apiExtension) {
            return errorMessage('Missing API extension');
        }

        // Jira API instantiation
        var JIRA = JiraAPI(options.baseUrl, options.apiExtension, options.username, options.password, options.jql);

        // Set project title in html
        setProjectTitle(options.description);

        // show main loading spinner
        toggleVisibility('div[id=loader-container]');

        // fetch issues
        JIRA.getIssues()
            .then(onFetchSuccess, onFetchError);

        function onFetchSuccess(response) {

            var issues = orderByParent(response.issues);



            // create issues HTML table
            drawIssuesTable(issues);

            // hide main loading spinner
            toggleVisibility('div[id=loader-container]');

            // asynchronously fetch and draw total worklog time
            issues.forEach(function(issue) {
                getIssue(issue);
                getIssueStatus(issue);
            });

        }

        function onFetchError(error) {
            // hide main loading spinner
            toggleVisibility('div[id=loader-container]');
            genericResponseError(error);
        }



        /****************
        Issue metrics functions
        ****************/

        // Fetch and refresh issue row
        function getIssue(issue) {

            // total time and it's acompanying loader are in the same td, so we can use previousSibling
            var totalTime = document.querySelector('div[class="issue-total-time-spent"][data-issue-id="' + issue.key + '"]');
            var totalLoader = totalTime.previousSibling;

            var remainingTime = document.querySelector('div[class="issue-remaining-time"][data-issue-id="' + issue.key + '"]');
            var remainingLoader = remainingTime.previousSibling;

            // hide worklog time and show loading
            totalTime.style.display = 'none';
            totalLoader.style.display = 'block';

            remainingTime.style.display = 'none';
            remainingLoader.style.display = 'block';


            // fetch issue
            JIRA.getIssue(issue.key)
                .then(onIssueFetchSuccess, onIssueFetchError);

            function onIssueFetchSuccess(response) {
                // set total time
                totalTime.innerText = sumWorklogs(response.fields.worklog.worklogs);
                remainingTime.innerText = response.fields.timetracking.remainingEstimate;
                if (remainingTime.innerText === 'undefined') remainingTime.innerText = '';
                // show worklog time and hide loading
                totalTime.style.display = 'block';
                totalLoader.style.display = 'none';
                remainingTime.style.display = 'block';
                remainingLoader.style.display = 'none';
                // clear time input value
                var timeInput = document.querySelector('input[data-issue-id=' + issue.key + ']');
                timeInput.value = '';
            }

            function onIssueFetchError(error) {
                // show worklog time and hide loading inspite the error
                totalTime.style.display = 'block';
                remainingTime.style.display = 'block';
                totalLoader.style.display = 'none';
                remainingLoader.style.display = 'none';
                genericResponseError(error);
            }

        }

        /****************
        Issue status functions
        ****************/

        // Fetch and refresh issue status
        function getIssueStatus(issue) {

            var statusDropDown = document.querySelector('select[class="issue-status-dropdown"][data-issue-id="' + issue.key + '"]');


            // fetch issue
            JIRA.getIssueTransitions(issue.key)
                .then(onIssueFetchSuccess, onIssueFetchError);

            function onIssueFetchSuccess(response) {
                for (var x in response.transitions) {
                    var transition = response.transitions[x];
                    var statusOption = buildHTML('option', transition.name, {
                        value: transition.name,
                        'data-issue-id': issue.key
                    });
                    statusDropDown.appendChild(statusOption);
                  }
            }

            function onIssueFetchError(error) {
                genericResponseError(error);
            }

        }

        // Worklogs sum in 'jira format' (1w 2d 3h 44m)
        function sumWorklogs(worklogs) {

            // Sum all worklog times seconds
            var totalSeconds = worklogs.reduce(function(a, b) {
                return { timeSpentSeconds: a.timeSpentSeconds + b.timeSpentSeconds }
            }, { timeSpentSeconds: 0 }).timeSpentSeconds;
            if(totalSeconds){
                // Get how many weeks in totalSeconds
                var totalWeeks = Math.floor(totalSeconds / 144000);
                // Deduce weeks from totalSeconds
                totalSeconds = totalSeconds % 144000;
                // Get how many days in the rest of the totalSeconds
                var totalDays = Math.floor(totalSeconds / 28800);
                // Deduce days from totalSeconds
                totalSeconds = totalSeconds % 28800;
                // Get how many hours in the rest of the totalSeconds
                var totalHours = Math.floor(totalSeconds / 3600);
                // Deduce hours from totalSeconds
                totalSeconds = totalSeconds % 3600;
                // Get how many minutes in the rest of the totalSeconds
                var totalMinutes = Math.floor(totalSeconds / 60);

                // return it in 'nicely' formated Jira format
                return (totalWeeks ? totalWeeks + 'w' : '') + ' ' + (totalDays ? totalDays + 'd' : '') + ' ' + (totalHours ? totalHours + 'h' : '') + ' ' + (totalMinutes ? totalMinutes + 'm' : '');
            }
            else{
                return '0h';
            }
        }



        /***************
        HTML interaction
        ****************/

        // Project title
        function setProjectTitle(projectName) {
            document.getElementById('project-name').innerText = projectName;
        }

        function toggleVisibility(query) {
            var element = document.querySelector(query);
            element.style.display = element.style.display == 'block' ? 'none' : 'block';
        }

        // Issues table
        function drawIssuesTable(issues) {

            var logTable = document.getElementById('jira-log-time-table');
            var tbody = buildHTML('tbody');

            issues.forEach(function(issue) {
                var row = generateLogTableRow(issue.key, issue.fields.summary, issue.fields.issuetype.name);
                tbody.appendChild(row);
            });

            logTable.appendChild(tbody);

        }

        // generate all html elements for issue table
        function generateLogTableRow(id, summary, issuetype) {

            /*************
             Issue ID cell
            *************/
            
            var idCell = buildHTML('td', null, {
                class: 'issue-id'
            });
            if(issuetype === "Story"){
                idCell = buildHTML('td', null, {
                    class: 'issue-id-story'
                });
            }

            var idText = document.createTextNode(id);

            /*********************
            Link to the JIRA issue
            *********************/

            var jiraLink = buildHTML('a', null, {
                href: options.baseUrl + "/browse/" + id,
                target: "_blank"
            });

            jiraLink.appendChild(idText);
            idCell.appendChild(jiraLink);

            /************
            Status summary
            ************/
           var statusCell = buildHTML('td', null, {
                class: 'issue-status',
                'data-issue-id': id
            });
            var statusDropDown = buildHTML('select', null, {
                class: 'issue-status-dropdown',
                'data-issue-id': id
            });

            //statusDropDown.addEventListener('click', null);
            statusCell.appendChild(statusDropDown);


            /************
            Issue summary
            ************/
            var summaryCell = buildHTML('td', summary, {
                class: 'issue-summary truncate'
            });

            /***************
            Total spent time
            ***************/
            // summary loader
            var loader = buildHTML('div', null, {
                class: 'loader-mini',
                'data-issue-id': id
            });
            // summary total time
            var totalTime = buildHTML('div', null, {
                class: 'issue-total-time-spent',
                'data-issue-id': id
            });
            // Issue total worklog sum
            var totalTimeContainer = buildHTML('td', null, {
                class: 'total-time-container',
                'data-issue-id': id
            });
            totalTimeContainer.appendChild(loader);
            totalTimeContainer.appendChild(totalTime);

             /***************
            Remaining time
            ***************/
            // summary loader
            var remainingLoader = buildHTML('div', 'none', {
                class: 'loader-mini',
                'data-issue-id': id
            });
            // summary total time
            var remainingTime = buildHTML('div', null, {
                class: 'issue-remaining-time',
                'data-issue-id': id
            });
            // Issue remaining time
            var remainingTimeContainer = buildHTML('td', null, {
                class: 'remaining-time-container',
                'data-issue-id': id
            });
            remainingTimeContainer.appendChild(remainingLoader);
            remainingTimeContainer.appendChild(remainingTime);


            /*********
            Time input
            *********/
            var timeInput = buildHTML('input', null, {
                class: 'issue-time-input',
                'data-issue-id': id
            });
            // Time input cell
            var timeInputCell = buildHTML('td');
            timeInputCell.appendChild(timeInput);

            /*********
            Date input
            *********/
            var dateInput = buildHTML('input', null, {
                type: 'date',
                class: 'issue-log-date-input',
                value: new Date().toDateInputValue(),
                'data-issue-id': id
            });
            // Date input cell
            var dateInputCell = buildHTML('td');
            dateInputCell.appendChild(dateInput);

            /************
            Action button
            ************/
            var actionButton = buildHTML('input', null, {
                type: 'button',
                value: 'Log Time',
                class: 'issue-log-time-btn',
                'data-issue-id': id
            });

            actionButton.addEventListener('click', logTimeClick);

            // Action button cell
            var actionCell = buildHTML('td');
            actionCell.appendChild(actionButton);

            /********
            Issue row
            ********/
            var row = buildHTML('tr', null, {
                'data-issue-id': id
            });

            row.appendChild(idCell);
            row.appendChild(statusCell);
            row.appendChild(summaryCell);
            row.appendChild(remainingTimeContainer);
            row.appendChild(totalTimeContainer);
            row.appendChild(timeInputCell);
            row.appendChild(actionCell);

            return row;

        }



        /********************
        Log time button click
        ********************/

        function logTimeClick(evt) {

            // clear any error messages
            errorMessage('');

            // get issue ID
            var issueId = evt.target.getAttribute('data-issue-id')

            // time input
            var timeInput = document.querySelector('input[data-issue-id=' + issueId + ']');
            // date input
            var dateInput = document.querySelector('input[class=issue-log-date-input][data-issue-id=' + issueId + ']');

            // validate time input
            if (!timeInput.value.match(/[0-9]{1,4}[wdhm]/g)) {
                errorMessage('Time input in wrong format. You can specify a time unit after a time value "X", such as Xw, Xd, Xh or Xm, to represent weeks (w), days (d), hours (h) and minutes (m), respectively.');
                return;
            }

            // hide total time and show loading spinner;
            toggleVisibility('div[class="issue-total-time-spent"][data-issue-id=' + issueId + ']');
            toggleVisibility('div[class="loader-mini"][data-issue-id=' + issueId + ']');

            var startedTime = getStartedTime(dateInput.value);

            JIRA.updateWorklog(issueId, timeInput.value, startedTime)
                .then(function(data) {
                    getIssue(issueId);
                }, function(error) {
                    // hide total time and show loading spinner;
                    toggleVisibility('div[class="issue-total-time-spent"][data-issue-id=' + issueId + ']');
                    toggleVisibility('div[class="loader-mini"][data-issue-id=' + issueId + ']');
                    genericResponseError(error);
                });

        }



        /***************
        Helper functions 
        ***************/

        // html generator
        function buildHTML(tag, html, attrs) {

            var element = document.createElement(tag);
            // if custom html passed in, append it
            if (html) element.innerHTML = html;

            // set each individual attribute passed in
            for (attr in attrs) {
                if (attrs[attr] === false) continue;
                element.setAttribute(attr, attrs[attr]);
            }

            return element;
        }

        // Simple Jira api error handling
        function genericResponseError(error) {

            var response = error.response || '';
            var status = error.status || '';
            var statusText = error.statusText || '';

            if (response) {
                try {
                    errorMessage(response.errorMessages.join(' '));
                } catch (e) {
                    errorMessage('Error: ' + status + ' - ' + statusText);
                }
            } else {
                errorMessage('Error: ' + status + ' ' + statusText);
            }

        }

        // UI error message
        function errorMessage(message) {
            var error = document.getElementById('error')
            error.innerText = message;
            error.style.display = 'block';
        }

        // Date helper to pre-select today's date in the datepicker
        Date.prototype.toDateInputValue = (function() {
            var local = new Date(this);
            local.setMinutes(this.getMinutes() - this.getTimezoneOffset());
            return local.toJSON().slice(0, 10);
        });

        function getStartedTime(dateString) {
            var date = new Date(dateString);
            var time = new Date();
            var tzo = -date.getTimezoneOffset();
            var dif = tzo >= 0 ? '+' : '-';

            return date.getFullYear() 
                + '-' + pad(date.getMonth()+1)
                + '-' + pad(date.getDate())
                + 'T' + pad(time.getHours())
                + ':' + pad(time.getMinutes()) 
                + ':' + pad(time.getSeconds()) 
                + '.' + pad(time.getMilliseconds())
                + dif + pad(tzo / 60) 
                + pad(tzo % 60);
        }

        function pad (num) {
            var norm = Math.abs(Math.floor(num));
            return (norm < 10 ? '0' : '') + norm;
        }

        // Listen to global events and show/hide main loading spiner
        // ** NOT USED AT THE MOMENT **
        function initLoader() {
            // Popup loading indicator
            var indicator = document.getElementById('loader-container');

            document.addEventListener('jiraStart', function() {
                indicator.style.display = 'block';
            }, false);

            document.addEventListener('jiraStop', function() {
                indicator.style.display = 'none';
            }, false);

        }

    }

}
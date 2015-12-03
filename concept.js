function SCPerfStatsMain() {
    this.tracker = new SCPerfStatsTracker();
    this.router = new SCPerfStatsRouter(this.tracker);
    this.action = new SCPerfStatsAction(this.tracker);
    this.action.router = this.router;
    this.active = false;

    this.init = function () {
        var self = this;
        this.router.onStart = function (route) {
            console.log(self.stackTrace());
            self.onRouteStart(route);
            self.action.ajaxRequestsCaused = 0;
            self.action.activeAjaxRequests = 0;
            self.tracker.start();
        };
        this.router.onEnd = function (rootStat) {
            self.onRouteEnd(self.router.currentRoute, rootStat);
            self.tracker.end();
        };

        this.router.hasActiveProcesses = function () {
            return self.action.activeAjaxRequests > 0;
        };
    };

    this.stackTrace = function () {
        var err = new Error();
        return err.stack;
    };

    this.onRouteStart = function (route) {
    };

    this.onRouteEnd = function (route) {
    };

    this.on = function () {
        this.router.on();
        this.action.on();
        this.active = true;
    };

    this.off = function () {
        this.router.off();
        this.action.off();
        this.active = false;
        this.tracker.end();
    };

    this.getStats = function () {
        return this.tracker.stats;
    };

    this.getTotals = function () {
        return this.tracker.statsTotals;
    };

    this.setStats = function (stats) {
        this.tracker.stats = stats;
    };

    this.init();
}

function SCPerfStatsRouter(tracker) {
    this.tracker = tracker;
    this.primaryActionStarted = false;
    this.wrappedFunction = {};
    this.currentRoute = '-';
    this.active = false;
    this.rootDescriptor;
    this.deferredDescriptor;
    this.ajaxDescriptor;
    this.deferredStarted;
    this.startedManually;

    this.getKeyFunc = function () {
        return {'obj': Backbone.history, 'prop': 'loadUrl'};
    };

    this.on = function () {
        var wrap = this.getKeyFunc();
        var self = this;
        this.wrappedFunction = _.extend(wrap.obj[wrap.prop]);
        this.primaryActionStarted = false;

        var before = function () {
            var route = this.getFragment ? this.getFragment(arguments[0]) : arguments[0];
            var descriptor = {'name': route, 'type': 'route', 'super_type': 'route'};
            if (!self.primaryActionStarted) {
                self.currentRoute = route;
                self.onStart(route);
                self.primaryActionStarted = true;
                descriptor['primary'] = true;
                var root = self.tracker.startAction(descriptor);
                descriptor['primary_descriptor'] = self.tracker.startAction({
                    'name': 'primary render',
                    'type': 'primary',
                    'super_type': 'primary'
                });
                self.rootDescriptor = root;
                return root;
            } else {
                return self.tracker.startAction(descriptor);
            }
        };
        this.manualStart = (function(route) {
            before(route);
            self.startedManually = true;
        });
        var after = function (res, descriptor) {
            if (descriptor['primary']) {
                self.primaryActionStarted = false;
                self.tracker.endAction(descriptor['primary_descriptor']);
                self.startDeferred(descriptor);
            } else {
                self.tracker.endAction(descriptor);
            }
        };
        this.manualEnd = (function() {
            after(true, self.rootDescriptor);
            self.startedManually = false;
            if (self.ajaxDescriptor) {
                self.tracker.endAction(self.ajaxDescriptor);
                self.ajaxDescriptor = null;
            }
            self.endDeferred();
        });
        wrap.obj[wrap.prop] = (function (fn, before, after, self) {
            return function () {
                var descriptor = before.apply(self, arguments);
                var res = fn.apply(self, arguments);
                if (after) after.apply(self, [res, descriptor]);
                return res;
            }
        })(wrap.obj[wrap.prop], before, after, wrap['obj']);
        this.active = true;
    };

    this.manualStart = function() {
    };

    this.manualEnd = function() {
    };

    this.onStart = function (route) {

    };

    this.onEnd = function () {

    };

    this.startDeferred = function (routeDescriptor) {
        this.deferredStarted = true;

        this.deferredDescriptor = {
            'name': 'deferred operations',
            'type': 'deferred',
            'super_type': 'deferred',
            'route_descriptor': routeDescriptor
        };

        this.deferredDescriptor = this.tracker.startAction(this.deferredDescriptor);

        if (!this.hasActiveProcesses()) {
            this.endDeferred();
        }
    };

    this.hasActiveProcesses = function () {
    };

    this.endDeferred = function () {
        if (this.deferredStarted) {
            this.deferredStarted = false;
            this.tracker.endAction(this.deferredDescriptor);
            var rootStat = this.tracker.endAction(this.deferredDescriptor['route_descriptor']);
            this.onEnd(rootStat);
            this.currentRoute = '-';
        }
    };

    this.getActionStats = function () {

    };

    this.off = function () {
        var wrap = this.getKeyFunc();
        if (this.wrappedFunction) {
            wrap.obj[wrap.prop] = this.wrappedFunction;
            this.wrappedFunction = null;
        }
        this.active = false;
        this.primaryActionStarted = false;
    };
}

function SCPerfStatsAction(tracker) {
    this.tracker = tracker;
    this.wrappedFunctions = {};
    this.beforeTimer = 0;
    this.activeAjaxRequests = 0;
    this.ajaxRequestsCaused = 0;
    this.deferredDescriptor;

    this.getKeyFuncs = function () {
        return {
            'layouts.render': {'obj': App.view.Layout, 'prop': 'render', 'proto': true},
            'layouts.dispose': {'obj': App.view.Layout, 'prop': 'dispose', 'proto': true},
            'views.render': {'obj': App.view.View, 'prop': 'render', 'proto': true},
            'views.dispose': {'obj': App.view.View, 'prop': 'dispose', 'proto': true},
            'alert_views.render': {'obj': App.view.AlertView, 'pro p': 'render', 'proto': true},
            'alert_views.dispose': {'obj': App.view.AlertView, 'prop': 'dispose', 'proto': true},
            'fields.render': {'obj': App.view.Field, 'prop': 'render', 'proto': true},
            'fields.dispose': {'obj': App.view.Field, 'prop': 'dispose', 'proto': true},
            'select2.destroy': {'obj': window.Select2.class.abstract, 'prop': 'destroy', 'proto': true},
            'select2.init': {'obj': window.Select2.class.abstract, 'prop': 'init', 'proto': true},
            'select2.plugin': {'obj': $.fn, 'prop': 'select2', 'proto': false}
        };
    };

    this.on = function () {
        this.wrappedFunctions = {};
        var wrap = this.getKeyFuncs();
        for (var k in wrap) {
            var tFnNs = wrap[k].obj;
            var tFnfunc = wrap[k].proto ? tFnNs.prototype[wrap[k].prop] : tFnNs[wrap[k].prop];
            this.wrappedFunctions[k] = _.extend(tFnfunc);

            (function (cat, tDef, self) {
                var before = function () {
                    return self.tracker.startAction({
                        'name': (typeof(this.name) === 'string' ? this.name : null)
                            || (typeof(this.id) === 'string' ? this.id : null)
                            || ('*' + cat),
                        'type': this.type || cat,
                        'super_type': cat
                    });
                };
                var after = function (res, descriptor) {
                    self.tracker.endAction(descriptor);
                };
                var tFnNs = tDef.obj;
                var tFnfunc = tDef.proto ? tFnNs.prototype[tDef.prop] : tFnNs[tDef.prop];
                var newFunc = (function (fn, before, after) {
                    return function () {
                        var descriptor = before.apply(this, arguments);
                        var res = fn.apply(this, arguments);
                        after.apply(this, [res, descriptor]);
                        return res;
                    }
                })(tFnfunc, before, after);

                for(var k in tFnfunc) {
                    newFunc[k] = tFnfunc[k];
                }

                if (tDef.proto) {
                    tFnNs.prototype[tDef.prop] = newFunc;
                } else {
                    tFnNs[tDef.prop] = newFunc;
                }

            })(k, wrap[k], this);
        }

        var self = this;
        $(document)
            .ajaxSend(function (event, request, settings) {
                self.ajaxSend(event, request, settings);
            })
            .ajaxComplete(function (event, request, settings) {
                self.ajaxComplete(event, request, settings);
            });
    };

    this.off = function () {
        var wrap = this.getKeyFuncs();
        for (var k in wrap) {
            if (this.wrappedFunctions[k]) {
                var tFnNs = wrap[k].obj;
                var tFnfunc = wrap[k].proto ? tFnNs.prototype[wrap[k].prop] : tFnNs.prop;
                if (wrap[k].proto) {
                    tFnNs.prototype[wrap[k].prop] = _.extend(this.wrappedFunctions[k]);
                } else {
                    tFnNs[wrap[k].prop] = _.extend(this.wrappedFunctions[k]);
                }
            }
        }
        this.wrappedFunctions = {};
        $(document).off('ajaxSend').off('ajaxComplete');
    };

    this.ajaxSend = function (event, request, settings) {
        if (this.ajaxRequestsCaused == 0 && this.router.rootDescriptor) {
            this.router.ajaxDescriptor = this.tracker.startAction({
                'name': 'ajax requests',
                'type': 'ajax operations',
                'super_type': 'ajax operations',
                'no_stack': true,
                'parent_id': this.router.rootDescriptor['id']
            });
        }

        this.ajaxRequestsCaused++;

        var pD = this.tracker.startAction({
            'name': settings.type + ' ' + settings.url.substr(0, 40),
            'full_name': settings.type + ' ' + settings.url,
            'type': 'start',
            'super_type': 'ajax',
            'no_stack': true
        });
        this.tracker.endAction(pD);

        var sD = this.tracker.startAction({
            'name': settings.type + ' ' + settings.url.substr(0, 30),
            'full_name': settings.type + ' ' + settings.url,
            'type': 'complete',
            'super_type': 'ajax',
            'no_stack': true,
            'no_ewt': true
        });
        settings['_ps_secondary_descriptor'] = sD;

        this.activeAjaxRequests++;
    };

    this.ajaxComplete = function (event, request, settings) {
        if (settings['_ps_secondary_descriptor']) {
            var sD = settings['_ps_secondary_descriptor'];
            sD.parent_id = this.router.ajaxDescriptor['id'];
            this.tracker.endAction(sD);

            this.activeAjaxRequests--;

            if (this.activeAjaxRequests == 0 && !this.router.startedManually) {
                if (this.router.ajaxDescriptor) {
                    this.tracker.endAction(this.router.ajaxDescriptor);
                    this.router.ajaxDescriptor = null;
                }
                this.router.endDeferred();
            }
        }
    };
};

function SCPerfStatsTracker() {
    this.stats = [];
    this.statsTotals = [];
    this.statCursor = -1;
    this.nextId = 0;
    this.enabled = false;
    this.stack;
    this.relStack = {};
    this.lastActivityTs = 0;

    this.start = function () {
        this.statCursor++;
        this.enabled = true;
        this.stack = [{'id': 0, 'type': '_root'}];
        this.relStack = {};
        this.stats.push({});
        this.statsTotals.push({});
    };

    this.end = function () {
        this.enabled = false;
    };

    this.startAction = function (descriptor) {
        if (this.enabled) {
            var parentId = descriptor.parent_id || this.stackCurrent();
            var uKey = parentId + '->' + descriptor.type + '^' + descriptor.name;
            descriptor['parent_id'] = parentId;
            this.lastActivityTs = descriptor['ts'] = Math.round(performance.now());
            if (this.relStack[uKey] && !descriptor['no_stack']) {
                descriptor['id'] = this.relStack[uKey];
                this.stackAdd(descriptor['id']);
            } else {
                this.nextId++;
                if (!descriptor['no_stack']) {
                    this.stackAdd(this.nextId);
                    this.relStack[uKey] = this.nextId;
                }
                descriptor['id'] = this.nextId;
            }
            return descriptor;
        }
    };

    this.endAction = function (descriptor) {
        if (this.enabled) {
            var ts = Math.round(performance.now());
            this.lastActivityTs = ts;

            if (!this.stats[this.statCursor][descriptor.id]) {
                this.stats[this.statCursor][descriptor.id] = {
                    'id': descriptor.id,
                    'parent_id': descriptor.parent_id,
                    'ct': 0,
                    'wt': 0,
                    'name': descriptor.name,
                    'full_name': descriptor.full_name,
                    'type': descriptor.type,
                    'super_type': descriptor.super_type,
                    'no_ewt': descriptor.no_ewt,
                    'ts': descriptor.ts
                }
            }
            this.stats[this.statCursor][descriptor.id]['ct']++;
            this.stats[this.statCursor][descriptor.id]['wt'] += (ts - descriptor.ts);

            if (!this.statsTotals[this.statCursor][descriptor.super_type]) {
                this.statsTotals[this.statCursor][descriptor.super_type] = {
                    'ct': 0,
                    'wt': 0,
                };
            }
            this.statsTotals[this.statCursor][descriptor.super_type]['ct']++;
            this.statsTotals[this.statCursor][descriptor.super_type]['wt'] += (ts - descriptor.ts);

            if (!descriptor['no_stack']) {
                this.stackRemove();
            }
            return this.stats[this.statCursor][descriptor.id];
        }
    };

    this.stackAdd = function (id, type) {
        this.stack.push({'id': id});
    };

    this.stackRemove = function () {
        return this.stack.pop();
    };

    this.stackCurrent = function () {
        return this.stack[this.stack.length - 1]['id'];
    };

    this.stackParent = function () {
        return this.stack.length > 1 ? this.stack[this.stack.length - 2]['id'] : 0;
    };
}

function SCPerfStatsViewer() {
    this.elContainer;
    this.elStats;
    this.elTree;
    this.elLog;
    this.elExpander;
    this.updateStatsInterval;
    this.sortBy = 'wt';

    this.init = function () {
        this.createContainer();
        this.createStats();
        this.createTree();
        this.createLog();
    };

    this.createContainer = function () {
        this.createExpander();
        this.elContainer = document.createElement('DIV');
        this.elContainer.className = 'alert alert-warning';
        this.elContainer.style.width = $('#footer').width() + 'px';
        this.elContainer.style.height = '300px';
        this.elContainer.style.bottom = '30px';
        this.elContainer.style.left = 0;
        this.elContainer.style.position = 'fixed';
        this.elContainer.style.zIndex = 100;
        this.elContainer.style.borderTop = '6px groove #777';

        var destroyBtn = document.createElement('DIV');
        destroyBtn.innerHTML = '<i class="fa fa-close" style="color:red"></i>';
        destroyBtn.style.position = 'absolute';
        destroyBtn.style.right = '40px';
        destroyBtn.style.width = '40px';
        destroyBtn.style.cursor = 'pointer';
        var self = this;
        destroyBtn.onclick = function () {
            self.onDestroy();
        };
        this.elContainer.appendChild(destroyBtn);

        var closeBtn = document.createElement('DIV');
        closeBtn.innerHTML = '<i class="fa fa-chevron-down"></i>';
        closeBtn.style.position = 'absolute';
        closeBtn.style.right = '40px';
        closeBtn.style.width = '40px';
        closeBtn.style.bottom = '10px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.onclick = function () {
            self.elContainer.style.display = 'none';
            self.elExpander.style.display = '';
        };
        this.elContainer.appendChild(closeBtn);

        var exportBtn = document.createElement('a');
        exportBtn.innerHTML = 'Export';
        exportBtn.style.position = 'absolute';
        exportBtn.style.href = 'javascript:void(0);';
        exportBtn.style.left = '10px';
        exportBtn.style.width = '70px';
        exportBtn.style.bottom = '10px';
        exportBtn.className = 'btn btn-primary';
        exportBtn.onclick = function () {
            var uri = "data:application/download;charset=utf-8;base64," + btoa(self.getForExport());
            var filename = 'sugar_client_perf.' + (new Date()).getTime() + '.json';
            var link = document.createElement('a');
            if (typeof link.download === 'string') {
                link.href = uri;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                window.open(uri);
            }
        };
        this.elContainer.appendChild(exportBtn);

        var importBtn = document.createElement('span');
        importBtn.innerHTML = 'Import';
        importBtn.style.position = 'absolute';
        importBtn.style.left = '100px';
        importBtn.style.width = '80px';
        importBtn.style.bottom = '10px';
        importBtn.innerHTML = '<label class="btn btn-primary" for="ps_i_file" style="width:60px"><input id="ps_i_file" '
            + 'type="file" style="display:none;">Import</label>';
        importBtn.onchange = function (e) {
            if (typeof window.FileReader !== 'function') {
                alert("The file API isn't supported on this browser yet.");
                return;
            }
            var input = e.target, file;
            if (!input) {
                alert("Um, couldn't find the fileinput element.");
            } else if (!input.files) {
                alert("This browser doesn't seem to support the `files` property of file inputs.");
            } else if (!input.files[0]) {
                alert("Please select a file before clicking 'Load'");
            } else {
                file = input.files[0];
                fr = new FileReader();
                fr.onload = function (e) {
                    lines = e.target.result;
                    try {
                        var json = JSON.parse(lines);
                    } catch (e) {
                        alert('Invalid JSON: ' + e.toString());
                        return;
                    }
                    self.onImportProvided(json, file);
                };
                fr.readAsText(file);
            }
        };
        this.elContainer.appendChild(importBtn);

        var manStartBtn = document.createElement('a');
        manStartBtn.innerHTML = 'Manual Start';
        manStartBtn.style.position = 'absolute';
        manStartBtn.style.href = 'javascript:void(0);';
        manStartBtn.style.left = '200px';
        manStartBtn.style.bottom = '10px';
        manStartBtn.className = 'btn btn-success';
        manStartBtn.onclick = function (e) {
            var startedText = 'Manual End',
                idleText = 'Manual Start',
                startedClass = 'btn btn-warning',
                idleClass = 'btn btn-success';
            var started = e.target.innerHTML == startedText;
            if (self.manStart(started)) {
                e.target.innerHTML = started ? idleText : startedText;
                e.target.className = started ? idleClass : startedClass;
            }
        };
        this.elContainer.appendChild(manStartBtn);


        $('#footer').append(this.elContainer);
    };

    this.onDestroy = function () {
    };

    this.getForExport = function () {
    };

    this.onImportProvided = function () {
    };

    this.manStart = function(started) {
    };

    this.createStats = function () {
        var panel = document.createElement('DIV');
        panel.className = 'dashlet span8';
        panel.style.width = '20%';
        panel.style.height = '50%';
        panel.style.marginLeft = '0';
        panel.style.overflowY = 'auto';
        panel.innerHTML = '<div class="dashlet-header"><h5 class="dashlet-title">STATS</h5></div>';
        this.elStats = document.createElement('PRE');
        this.elStats.className = 'dashlet-content';
        this.elStats.style.textAlign = 'left';
        panel.appendChild(this.elStats);
        this.elContainer.appendChild(panel);
    };

    this.createTree = function () {
        var panel = document.createElement('DIV');
        panel.className = 'dashlet span8';
        panel.style.width = '45%';
        panel.style.height = '100%';
        panel.style.marginLeft = '0';
        panel.style.overflowY = 'auto';
        panel.innerHTML = '<div class="dashlet-header"><h5 class="dashlet-title">EXECUTION TREE</h5></div>';
        var body = document.createElement('DIV');
        this.elTree = document.createElement('SPAN');
        body.className = 'dashlet-content';
        body.style.textAlign = 'left';
        panel.appendChild(body);
        body.appendChild(this.elTree);
        this.elContainer.appendChild(panel);

        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = '.ptree label {'
            + '        cursor: pointer;'
            + '        margin: 0;'
            + '        }'
            + '.ptree ul, .ptree li {'
            + '        cursor: default;'
            + '        list-style: none;'
            + '        margin: 0;'
            + '        overflow: hidden;'
            + '    }'
            + '.ptree li ul {'
            + '        height: 0;'
            + '        padding-left: 20px;'
            + '    }'
            + '.ptree li input {'
            + '        display: none;'
            + '    }'
            + '.ptree li input:checked ~ ul {'
            + '        height: auto;'
            + '    }'
            + '.ptree input + label:before {'
            + '    background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAALCAIAAAAmzuBxAAAACXBIWXMAAAsSAAALEgHS3X78AAAAkElEQVQYlXWOvRWDQAyDv/DYK2wQSro8OkpGuRFcUjJCRmEE0TldCpsjPy9qzj7Jki62Pgh4vnqbbbEWuN+use/PlArwHccWGg780psENGFY6W4YgxZIAM339WmT3m397YYxxn6aASslFfVotYLTT3NwcuTKlFpNR2sdEak4acdKeafPlE2SZ7sw/1BEtX94AXYTVmyR94mPAAAAAElFTkSuQmCC) no-repeat 0 5px;'
            + "    content: '';"
            + '    display: inline-block;'
            + '    height: 16px;'
            + '    width: 16px;'
            + '}'
            + 'input:checked + label:before {'
            + '    background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAALCAIAAAAmzuBxAAAACXBIWXMAAAsSAAALEgHS3X78AAAAeklEQVQYlX2PsRGDMAxFX3zeK9mAlHRcupSM4hFUUjJCRpI70VHIJr7D8BtJ977+SQ9Zf7isVG16WSQC0/D0OW/FqoBlDFkIVJ2xAhA8sI/NHbcYiFrPfI0fGklKagDx2F4ltdtaM0J9L3dxcVxi+zv62E+MwPs7c60dClRP6iug7wUAAAAASUVORK5CYII=) no-repeat 0 5px;'
            + '}'
            + '.ptree {'
            + '    padding: 5px 0 0 15px;'
            + '}';
        document.getElementsByTagName('head')[0].appendChild(style);

        this.elTree.className = 'ptree';
    };

    this.convertStats = function (stats) {
        var out = [];

        for (var sCursor = 0; sCursor < stats.length; sCursor++) {
            for (var sId in stats[sCursor]) {
                stats[sCursor][sId]['parentid'] = stats[sCursor][sId]['parent_id'];
                stats[sCursor][sId]['children'] = [];
            }

            var buf = this.unflatten(stats[sCursor]);
            for (var i = 0; i < buf.length; i++) {
                out.push(buf[i]);
            }
        }

        out = {'children': out};

        this.calcExclWt = function (data) {
            if (data['children'].length > 0) {
                if (data['type'] !== 'ajax operations') {
                    data['ewt'] = data['wt'];
                } else {
                    data['ewt'] = 0;
                }
                for (var i = 0; i < data['children'].length; i++) {
                    if (data['children'][i]['type'] !== 'ajax operations' && !data['children'][i]['no_ewt']) {
                        data['ewt'] -= data['children'][i]['wt'];
                    }
                    if (data['children'][i]['children'].length > 0) {
                        this.calcExclWt(data['children'][i]);
                    } else {
                        data['children'][i]['ewt'] = data['children'][i]['wt'];
                    }
                }
            }
        };
        this.calcExclWt(out);

        this.sort = function (data) {
            var sBy = this.sortBy;
            if (data['children'].length > 0) {
                data['children'] = _.sortBy(data['children'], function (obj) {
                    return -obj[sBy];
                });
                for (var i = 0; i < data['children'].length; i++) {
                    if (data['children'][i]['children'].length > 0) {
                        this.sort(data['children'][i]);
                    }
                }
            }
        };
        this.sort(out);

        out = {
            'children': _.sortBy(out['children'], function (obj) {
                return -obj.ts;
            })
        };

        return out;
    };

    this.unflatten = function (array, parent, tree) {

        tree = typeof tree !== 'undefined' ? tree : [];
        parent = typeof parent !== 'undefined' ? parent : {id: 0};

        var children = _.filter(array, function (child) {
            return child.parentid == parent.id;
        });

        var self = this;
        if (!_.isEmpty(children)) {
            if (parent.id == 0) {
                tree = children;
            } else {
                parent['children'] = children
            }
            _.each(children, function (child) {
                self.unflatten(array, child)
            });
        }

        return tree;
    }

    this.refreshTree = function (stats) {
        var data = this.convertStats(stats);
        var self = this;
        var typeLabels = {
            'route': '<b style="color:#FF8C00">ROUTE</b>',
            'layouts.render': '<b style="color:#556B2F">layouts.render</b>',
            'views.render': '<b style="color:#556B2F">views.render</b>',
            'fields.render': '<b style="color:#556B2F">fields.render</b>',
            'layouts.dispose': '<b style="color:#4682B4">layouts.dispose</b>',
            'views.dispose': '<b style="color:#4682B4">views.dispose</b>',
            'fields.dispose': '<b style="color:#4682B4">fields.dispose</b>',
            'fields': '<b style="color:#8B8682">field</b>',
            'primary': '<b style="color:#333">PRIMARY</b>',
            'deferred': '<b style="color:#333">DEFERRED</b>',
            'ajax operations': '<b style="color:#8B8682">AJAX OPERATIONS</b>'
        };
        var n = 0;
        this.createPTree = function (dom, data, key, first) {
            var ts = false;
            if (first) {
                var oldDom = dom;
                var ul = document.createElement('UL');
                oldDom.appendChild(ul);
                dom = ul;
                tsRequired = true;
            }
            if (data['children'].length > 0) {
                for (var i = 0; i < data['children'].length; i++) {
                    n++;
                    var obj = data['children'][i];
                    var tsLabel = tsRequired ? '<i style="color:silver">' + (new Date(obj.ts)).toLocaleTimeString() + '</i> ' : '';
                    var typeLabel = '';
                    if (obj.type == obj['super_type']) {
                        typeLabel = typeLabels[obj.type] || '<b style="color:red">' + obj.type + '</b>';
                    } else {
                        typeLabel = '<b style="color:#8B8682">' + obj.type + '</b> > '
                            + (typeLabels[obj['super_type']] || '<b style="color:red">' + obj['super_type'] + '</b>');
                    }
                    if (data['children'][i]['children'].length > 0) {
                        var li = document.createElement('LI');
                        var ul = document.createElement('UL');
                        li.innerHTML += '<input id="chk_' + n + '" type="checkbox"><label for="chk_' + n + '"> '
                            + tsLabel + obj.name + ' [ ct:' + obj.ct + ', wt: ' + obj.wt + ', ewt: ' + obj.ewt + ' ] ' + typeLabel
                            + ' </label>';
                        li.appendChild(ul);
                        dom.appendChild(li);
                        self.createPTree(ul, data['children'][i], data['children'][i]);
                    } else {
                        var li = document.createElement('LI');
                        li.innerHTML = tsLabel + obj.name + ' [ ct:' + obj.ct + ', wt: ' + obj.wt + ', ewt: ' + obj.ewt + ' ] ' + typeLabel;
                        dom.appendChild(li);
                    }
                }
            }
        };

        this.elTree.innerHTML = '';
        this.createPTree(this.elTree, data, '', true);
    };

    this.createLog = function () {
        var panel = document.createElement('DIV');
        panel.className = 'dashlet span8';
        panel.style.width = '25%';
        panel.style.height = '100%';
        panel.style.marginLeft = '0';
        panel.style.overflowY = 'auto';
        panel.innerHTML = '<div class="dashlet-header"><h5 class="dashlet-title">LOG</h5></div>';
        this.elLog = document.createElement('PRE');
        this.elLog.className = 'dashlet-content';
        this.elLog.style.textAlign = 'left';
        this.elLog.style.whiteSpace = 'pre-wrap';
        panel.appendChild(this.elLog);
        this.elContainer.appendChild(panel);
    };

    this.createExpander = function () {
        var expander = document.createElement('DIV');
        expander.style.border = '6px solid #F22';
        expander.style.display = 'none';
        expander.style.width = '160px';
        expander.style.height = '30px';
        expander.style.bottom = '2px';
        expander.style.left = '200px';
        expander.style.position = 'fixed';
        expander.style.zIndex = 9999;
        expander.style.fontSize = '14px';
        expander.style.fontWeight = 'bold';
        expander.style.backgroundColor = '#FAFAFA';
        expander.style.textAlign = 'center';
        expander.style.lineHeight = '30px';
        expander.style.cursor = 'pointer';
        expander.innerHTML = 'OPEN STATISTICS';
        var self = this;
        expander.onclick = function () {
            self.elContainer.style.display = '';
            self.elExpander.style.display = 'none';
        };
        this.elExpander = expander;
        document.body.appendChild(this.elExpander);
    };

    this.log = function (msg) {
        if (_.isObject(msg)) {
            msg = JSON.stringify(msg);
        }
        var t = (new Date()).toLocaleTimeString();
        this.elLog.innerHTML += '<i style="color:silver">' + t + '</i> ' + msg + '\n';
    };

    this.updateStats = function (stats) {
        var s = '';
        for (var k in stats) {
            s += '<b>' + k + '</b>: ' + stats[k] + '\n';
        }
        this.elStats.innerHTML = s;
    };

    this.updateStatsFunc = function () {

    };

    this.setUpdateStatsHandler = function (handler, interval) {
        var self = this;
        this.updateStatsFunc = function () {
            self.updateStats(handler());
        };
        this.updateStatsInterval = setInterval(this.updateStatsFunc, interval);
    };

    this.destroy = function () {
        if (this.updateStatsInterval) {
            clearInterval(this.updateStatsInterval);
        }
        this.elExpander.parentNode.removeChild(this.elExpander);
        this.elContainer.parentNode.removeChild(this.elContainer);
    };
}

window._psOn = function () {
    var main = new SCPerfStatsMain();
    var viewer = new SCPerfStatsViewer();

    main.on();
    main.onRouteStart = function (route) {
        viewer.updateStatsFunc();
        console.log('Action start: ' + route);
    };
    main.onRouteEnd = function (route, rootStat) {
        console.log('Action end: ' + route);
        viewer.log('route finished: ' + route + ', ajax requests: ' + main.action.ajaxRequestsCaused + ', wt: ' + rootStat.wt);
        viewer.refreshTree(main.getStats());
        viewer.log(main.getTotals());
    };

    viewer.getForExport = function () {
        return JSON.stringify(main.getStats());
    };

    viewer.onImportProvided = function (data, file) {
        viewer.log('data imported from: ' + file.name);
        main.setStats(data);
        viewer.refreshTree(main.getStats());
    };

    viewer.manStart = function(started) {
        if ((main.router.primaryActionStarted || main.router.deferredStarted) && !main.router.startedManually) {
            return false;
        }
        if (started) {
            main.router.manualEnd();
        } else {
            main.router.manualStart('manual_' + (new Date()).toLocaleTimeString());
        }
        return true;
    };

    viewer.init();
    viewer.log('interface created');
    viewer.setUpdateStatsHandler(
        function () {
            return {
                'updated': (new Date()).toLocaleTimeString(),
                'router status': main.router.primaryActionStarted || main.router.deferredStarted
                    ? '<b style="color:green">ACTIVE</b>'
                    : '<b style="color:silver">IDLE</b>',
                'handling route': main.router.currentRoute,
                'Active AJAX requests': main.action.activeAjaxRequests > 0
                    ? '<b style="color:red">' + main.action.activeAjaxRequests + '</b>'
                    : '<b style="color:silver">0</b>',
            };
        },
        1000
    );

    viewer.onDestroy = function () {
        window._psOff();
    }

    window._psObj = main;
    window._psObjV = viewer;
};

window._psOff = function () {
    if (window._psObj) {
        window._psObj.off();
    }
    if (window._psObjV) {
        window._psObjV.destroy();
    }
};

window._psOn();

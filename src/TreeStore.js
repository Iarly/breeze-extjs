Ext.define("Breeze.data.TreeStore", {
    extend: Ext.data.TreeStore,

    pageSize: 25,

    currentPage: 1,

    constructor: function (config) {
        config = config || {};
        config.autoSync = true;
        config.proxy = config.proxy || {
            type: 'BreezeData',
            queryable: null,
            reader: new Ext.data.reader.Breeze({})
        };
        this.callParent([config]);
    },

    sync: function (options) {
        var me = this,
            operations = {},
            toCreate = me.getNewRecords(),
            toUpdate = me.getUpdatedRecords(),
            toDestroy = me.getRemovedRecords(),
            needsSync = false;

        if (toCreate.length > 0) {
            operations.create = toCreate;
            needsSync = true;
        }

        if (toUpdate.length > 0) {
            operations.update = toUpdate;
            needsSync = true;
        }

        if (toDestroy.length > 0) {
            operations.destroy = toDestroy;
            needsSync = true;
        }

        if (needsSync && me.fireEvent('beforesync', operations) !== false) {
            options = options || {};

            me.proxy.batch(Ext.apply(options, {
                entityManager: me.parentModel && me.parentModel.raw.entityAspect ?
                    me.parentModel.raw.entityAspect.entityManager : null,
                operations: operations,
                listeners: me.getBatchListeners()
            }));
        }

        return me;
    },

    getCount: function () {
        return this.getTotalCount();
    },

    getTotalCount: function () {
        if (!this.proxy.reader.rawData) return 0;
        this.totalCount = this.proxy.reader.getTotal(this.proxy.reader.rawData);
        return this.totalCount;
    },

    getStore: function () {
        return this;
    },

    currentPage: 1,

    clearRemovedOnLoad: true,

    clearOnPageLoad: true,

    addRecordsOptions: {
        addRecords: true
    },

    clearFilter: function () {
        return Breeze.data.Store.prototype.clearFilter.apply(this, arguments);
    },

    filter: function () {
        return Breeze.data.Store.prototype.filter.apply(this, arguments);
    },

    loadPage: function (page, options) {
        var me = this;


        me.currentPage = page;


        // Copy options into a new object so as not to mutate passed in objects
        options = Ext.apply({
            page: page,
            start: (page - 1) * me.pageSize,
            limit: me.pageSize,
            addRecords: !me.clearOnPageLoad
        }, options);


        if (me.buffered) {
            return me.loadToPrefetch(options);
        }
        me.read(options);
    },

    nextPage: function (options) {
        this.loadPage(this.currentPage + 1, options);
    },

    previousPage: function (options) {
        this.loadPage(this.currentPage - 1, options);
    },

    loadData: function (data, append) {
        var me = this,
            model = me.model,
            length = data.length,
            newData = [],
            i,
            record;


        for (i = 0; i < length; i++) {
            record = data[i];


            if (!(record.isModel)) {
                record = Ext.ModelManager.create(record, model);
            }
            newData.push(record);
        }


        me.loadRecords(newData, append ? me.addRecordsOptions : undefined);
    },

    loadRecords: function (records, options) {
        var me = this,
            i = 0,
            length = records.length,
            start,
            addRecords,
            snapshot = me.snapshot;


        if (options) {
            start = options.start;
            addRecords = options.addRecords;
        }


        if (!addRecords) {
            delete me.snapshot;
            me.clearData(true);
        } else if (snapshot) {
            snapshot.addAll(records);
        }


        me.data.addAll(records);


        if (start !== undefined) {
            for (; i < length; i++) {
                records[i].index = start + i;
                records[i].join(me);
            }
        } else {
            for (; i < length; i++) {
                records[i].join(me);
            }
        }


        /*
         * this rather inelegant suspension and resumption of events is required because both the filter and sort functions
         * fire an additional datachanged event, which is not wanted. Ideally we would do this a different way. The first
         * datachanged event is fired by the call to this.add, above.
         */
        me.suspendEvents();


        if (me.filterOnLoad && !me.remoteFilter) {
            me.filter();
        }


        if (me.sortOnLoad && !me.remoteSort) {
            me.sort(undefined, undefined, undefined, true);
        }


        me.resumeEvents();
        me.fireEvent('datachanged', me);
        me.fireEvent('refresh', me);
    },

    clearData: function (isLoad) {
        var me = this,
            records = me.data.items,
            i = records.length;


        while (i--) {
            records[i].unjoin(me);
        }
        me.data.clear();
        if (isLoad !== true || me.clearRemovedOnLoad) {
            me.removed.length = 0;
        }
    }

});
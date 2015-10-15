Ext.define("Stratws.data.Store", {
    extend: Ext.data.Store,

    constructor: function (config) {
        config = config || {};
        config.proxy = config.proxy || {
            type: 'BreezeData',
            queryable: null,
            reader: new Ext.data.reader.Breeze({})
        };
        config.autoSync = config.autoSync == null ? true : config.autoSync;
        config.remoteFilter = true;
        this.callParent([config]);
    },

    insert: function (index, records) {
        var me = this,
            sync = true,
            i, len, record,
            defaults = me.modelDefaults,
            out;

        // isIterable allows an argument list of multiple records to be passed unchanged (from add)
        if (!Ext.isIterable(records)) {
            out = records = [records];
        } else {
            out = [];
        }
        len = records.length;

        if (len) {
            for (i = 0; i < len; i++) {
                record = records[i];
                if (!record.isModel) {
                    record = me.createModel(record);
                }
                out[i] = record;
                if (defaults) {
                    record.set(defaults);
                }

                record.join(me);
                //sync = sync || record.phantom === true;
            }
            // Add records to data in one shot
            me.data.insert(index, out);

            if (me.snapshot) {
                me.snapshot.addAll(out);
            }

            if (me.requireSort) {
                // suspend events so the usual data changed events don't get fired.
                me.suspendEvents();
                me.sort();
                me.resumeEvents();
            }

            if (me.isGrouped()) {
                me.updateGroupsOnAdd(out);
            }

            me.fireEvent('add', me, out, index);
            me.fireEvent('datachanged', me);
            if (me.autoSync && sync && !me.autoSyncSuspended) {
                me.sync();
            }
        }
        return out;
    },

    sync: function (options) {
        var me = this,
            operations = {},
            toCreate = me.getNewRecords(),
            toUpdate = me.getUpdatedRecords(),
            toDestroy = me.getRemovedRecords(),
            entityManager = me.entityManager || (me.parentModel && me.parentModel.raw && me.parentModel.raw.entityAspect ?
                    me.parentModel.raw.entityAspect.entityManager : null),
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
                entityManager: entityManager,
                operations: operations,
                listeners: me.getBatchListeners()
            }));
        }

        return me;
    },

    loadPage: function (pageNum, options) {
        pageNum = pageNum <= 0 ? 1 : pageNum;
        return this.callParent([pageNum, options]);
    },

    load: function (options) {
        var me = this;

        if (typeof options == 'function') {
            options = {
                callback: options
            };
        } else {
            options = Ext.apply({}, options);
        }

        // coloca como padrão addRecords como true...
        options.addRecords = options.addRecords == null ? true : options.addRecords;

        return me.callParent([options]);
    }

});
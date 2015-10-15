breeze.CreateExtJSModel = function (entityType, isTreeModel) {

    /* Generate class name */
    var className = entityType.namespace +
        (isTreeModel ? '.tree.' : '.') +
        entityType.shortName;

    /* Define model config */
    var modelConfig = {
        extend: isTreeModel ? 'Ext.data.TreeModel' : 'Ext.data.Model',
        autoSync: true,
        getReferencesCount: function () {
            var raw = this.raw;
            var count = 0;
            for (var key in raw) {
                if (raw[key] instanceof Array && raw[key].length >= 1) {
                    count += raw[key].length;
                }
            }
            return count;
        },
        isAdded: function () {
            var raw = this.raw;
            return !raw || raw.entityAspect == null ? true :
                raw.entityAspect.entityState.isAdded();
        },
        constructor: function (data, context) {
            if (context && context._$typeName == "EntityManager") {
                var entity = data.entityAspect ? data : context.createEntity(entityType.shortName, data);
                this.phantom = entity.entityAspect.entityState.isAdded();
                return this.callParent([entity]);
            }
            if (data)
                this.phantom = data.Id != 'root' && (data.entityAspect == null ? true : data.entityAspect.entityState.isAdded());
            return this.callParent(arguments);
        },
        destroy: function (options) {
            options = Ext.apply({
                records: [this],
                action: 'destroy'
            }, options);

            var me = this,
                isNotPhantom = me.phantom !== true,
                scope = options.scope || me,
                stores,
                i = 0,
                storeCount,
                store,
                args,
                operation,
                callback;

            operation = new Ext.data.Operation(options);

            callback = function (operation) {
                args = [me, operation];

                // The stores property will be mutated, so clone it first
                stores = Ext.Array.clone(me.stores);
                if (operation.wasSuccessful()) {
                    for (storeCount = stores.length; i < storeCount; i++) {
                        store = stores[i];

                        // If the store has a remove it's not a TreeStore
                        if (store.remove) {
                            store.remove(me, true);
                        } else {
                            store.fireEvent('bulkremove', store, [me], [store.indexOf(me)], false);
                        }

                        if (isNotPhantom) {
                            store.fireEvent('write', store, operation);
                        }
                    }
                    me.clearListeners();
                    Ext.callback(options.success, scope, args);
                } else {
                    Ext.callback(options.failure, scope, args);
                }
                Ext.callback(options.callback, scope, args);
            };

            me.getProxy().destroy(operation, callback, me);
            return me;
        },
        fields: entityType.dataProperties ? entityType.dataProperties.map(function (property) {
            return {
                name: property.name,
                defaultValue: property.isNullable ? null : property.dataType.defaultValue,
                type: property.dataType
            };
        }) : null,
        associations: entityType.navigationProperties ? entityType.navigationProperties.map(function (nav) {
            var entityTypeNames = nav.entityTypeName.split(':#');
            var entityTypeName = entityTypeNames[1] + '.' + entityTypeNames[0];
            return {
                type: nav.isScalar ? 'hasOne' : 'hasMany',
                model: entityTypeName,
                primaryKey: entityType.keyProperties[0].name,
                foreignKey: nav.isScalar ? nav.foreignKeyNames.length > 0 ? nav.foreignKeyNames[0] : null
                    : nav.invForeignKeyNames.length > 0 ? nav.invForeignKeyNames[0] : null,
                associatedName: nav.name,
                name: nav.name
            };
        }) : null,
        idProperty: 'Id',
        proxy: {
            type: 'BreezeData',
            reader: new Ext.data.reader.Breeze({})
        }
    };

    /* Define default fields */
    modelConfig.fields = modelConfig.fields.concat([{
        name: 'leaf',
        defaultValue: true
    }, {
        name: 'text',
        convert: function (value, record) {
            return record.get("Name");
        }
    }, {
        name: 'iconCls',
        convert: function (value, data) {
            return data.iconCls ? data.iconCls : 'icon_' + entityType.shortName;
        }
    }]);

    if (decorators && decorators[entityType.shortName]) {
        decorators[entityType.shortName].decorate(modelConfig);
    }

    modelConfig.fields.push({
        name: '__isAdded',
        convert: function (value, record) {
            return record.isAdded();
        }
    });

    var classModel = Ext.define(className, modelConfig);
    classModel.prototype.entityType = entityType;
    classModel.entityType = entityType;

    return classModel;
};
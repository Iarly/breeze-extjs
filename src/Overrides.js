Ext.override(Ext.data.association.HasOne,
{
    createSetter: function () {
        var me = this,
            foreignKey = me.foreignKey,
            instanceName = me.instanceName;

        //'this' refers to the Model instance inside this function
        return function (value, options, scope) {
            // If we were passed a record, the value to set is the key of that record.
            var setByRecord = value && value.isModel,
                valueToSet = setByRecord ? value.getId() : value;

            // Setter was passed a record.
            if (setByRecord) {
                this[instanceName] = value;
            } // Otherwise, if the key of foreign record !== passed value, delete the cached foreign record
            else if (this[instanceName] instanceof Ext.data.Model && !this.isEqual(this.get(foreignKey), valueToSet)) {
                delete this[instanceName];
            }

            // Set the forign key value
            this.set(foreignKey, valueToSet);

            if (Ext.isFunction(options)) {
                options = {
                    callback: options,
                    scope: scope || this
                };
            }
            if (this.raw.entityAspect && this.raw.entityAspect.entityManager) {
                options = options || {};
                options.entityManager = this.raw.entityAspect.entityManager;
            }
            if (Ext.isObject(options)) {
                return value.save(options);
            }
        };
    },

    createGetter: function () {
        var d = this, g = d.ownerModel, e = d.associatedName, h = d.associatedModel, c = d.foreignKey, b = d.primaryKey, a = d.instanceName;
        return function (m, n) {
            m = m || {};
            var l = this, o = l.get(c), p, j, k;

            if (m.reload === true || ((l[a] == null || l[a].raw == null) && (l.raw && l.raw[d.associatedName]))) {
                var model = null;
                var entity = l.raw[d.associatedName];

                if (entity) {
                    var entityType = Class.resolve(entity.entityType.namespace + '.' + entity.entityType.shortName);
                    model = new entityType(entity);
                    model.phantom = false;
                } else {
                    return null;
                    //model = new d.associatedModel();
                    //model.phantom = true;
                }

                // j.set(b, o);
                if (typeof m == "function") {
                    m = { callback: m, scope: n || l }
                }
                p = m.success;
                m.success = function (q) {
                    l[a] = q;
                    if (p) {
                        p.apply(this, arguments)
                    }
                };
                //h.load(o, m);
                l[a] = model;
                return model;
            } else {
                j = l[a];
                k = [j];
                n = n || m.scope || l;
                Ext.callback(m, n, k);
                Ext.callback(m.success, n, k);
                Ext.callback(m.failure, n, k);
                Ext.callback(m.callback, n, k);
                return j
            }
        }
    }
});

Ext.override(Ext.data.association.HasMany,
{
    createStore: function () {
        var h = this, j = h.associatedModel, c = h.storeName, d = h.foreignKey, a = h.primaryKey, g = h.filterProperty, b = h.autoLoad, e = h.storeConfig || {};
        return function () {
            var n = this, l, m, k = {}, o, s;
            if (n[c] === undefined) {
                o = n.get(a);
                if (g) {
                    m = { property: g, value: n.get(g), exactMatch: true }
                } else {
                    if (n.hasId(o)) {
                        m = { property: d, value: o, exactMatch: true }
                    }
                }
                if (h.orderBy) {
                    s = [];
                    var orders = h.orderBy.split(',');
                    for (var i = 0; i < orders.length; i++) {
                        s.push(orders[i]);
                    }
                }
                k[d] = n.get(a);
                /*
                 * parentModel foi inserido
                 */
                l = Ext.apply({}, e, {
                    model: j,
                    addRecords: true,
                    parentModel: n,
                    association: h,
                    filters: m ? [m] : undefined,
                    sorters: s ? s : undefined,
                    remoteFilter: false,
                    modelDefaults: k,
                    disableMetaChangeEvent: true
                });
                if (h.tree) n[c] = Breeze.data.TreeStore.create(l);
                else n[c] = Breeze.data.Store.create(l);
                if (b || (n.raw[h.associatedName] && n.raw[h.associatedName].length > 0)) {

                    var reader = h.getReader();
                    if (!reader) {
                        proxy = h.associatedModel.getProxy();

                        if (proxy) {
                            reader = proxy.getReader();
                        } else {
                            reader = new Ext.data.reader.Reader({
                                model: h.associatedName
                            });
                        }
                    }

                    if (!n[c].add) {
                        if (n[c].getRootNode() == null) {
                            n[c].setRootNode({
                                text: '',
                                leaf: false,
                                expanded: false
                            });
                        }

                        n[c].getRootNode()
                            .appendChild(reader.read(n.raw[h.associatedName]).records);
                        n[c].getRootNode().expand();
                    } else {
                        n[c].loadRecords(reader.read(n.raw[h.associatedName]).records);
                    }

                    ////n[c].load()
                    //if (n[c].add)
                    //    n[c].add(reader.read(n.raw[h.associatedName]).records);
                    //else {
                    //    n[c].root.add(reader.read(n.raw[h.associatedName]).records);
                    //}
                }
            }
            return n[c]
        }
    }
});

Ext.override(Ext.data.Model, {
    prepareAssociatedData: function (seenKeys, depth) {
        var me = this,
            associations = me.associations.items,
            associationCount = associations.length;

        for (i = 0; i < associationCount; i++) {
            association = associations[i];
            associationId = association.associationId;

            /*
             * Ao fazer isso, força ignorar as associações tree
             */
            if (association.tree) {
                seenKeys[associationId] = Infinity;
            }
        }

        return this.callParent([seenKeys, depth]);
    }
});
Ext.define("Ext.data.reader.Breeze", {
    extend: Ext.data.reader.Json,
    totalProperty: 'inlineCount',
    root: 'results',

    getData: function (d) {
        return d;
    },

    /**
     * @private
     * @method
     * Returns an accessor function for the given property string. Gives support for properties such as the following:
     *
     * - 'someProperty'
     * - 'some.property'
     * - '["someProperty"]'
     * - 'values[0]'
     * - 'someFunction()' 
     *
     * This is used by {@link #buildExtractors} to create optimized extractor functions for properties that are looked
     * up directly on the source object (e.g. {@link #successProperty}, {@link #messageProperty}, etc.).
     */
    createAccessor: (function () {
        var re = /[\[\.]/;

        return function (expr) {
            if (Ext.isEmpty(expr)) {
                return Ext.emptyFn;
            }
            if (Ext.isFunction(expr)) {
                return expr;
            }
            if (this.useSimpleAccessors !== true) {
                var i = String(expr).search(re);
                if (i >= 0) {
                    return Ext.functionFactory('obj', 'return obj' + (i > 0 ? '.' : '') + expr);
                }
            }
            return function (obj) {
                /* Makes possible define a function as a expression */
                if (expr.indexOf("()") !== -1)
                    return obj[expr.substring(0, expr.length - 2)]();
                return obj[expr];
            };
        };
    }()),

    /**
     * @private
     * @method
     * Transform breeze.js entities to extJS models 
     */
    extractData: function (data) {
        if (!data.length && Ext.isObject(data))
            data = [k];
        var models = [];
        for (var i = 0; i < data.length; i++) {
            var item = data[i];

            if (item.isModel) {
                models.push(item);
                continue;
            }

            var modelType = this.model;

            /* Search for model definition from breeze.js entityType */
            if (item.entityType && this.model.prototype.$className.indexOf(item.entityType.namespace) > -1) {
                var istree = this.model.prototype.$className.indexOf('.tree.') > -1;
                modelType = (item.entityType.namespace + (istree ? '.tree.' : '.') + item.entityType.shortName);
                models.push(Ext.create(modelType, item));
            } /* Otherwise use default model from store definition */
            else {
                var e = {};
                var model = null;
                models.push(model = new modelType(undefined, this.getId(item), item, e));
                model.phantom = false;
                this.convertRecordData(e, item, model);
            }
            //if (this.implicitIncludes && model.associations.length) {
            //    this.readAssociated(model, item);
            //}
        }
        return models;
    }
});
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const InternalCustomer = sequelize.define('InternalCustomer', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    customerName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    stripeCustomerId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    }
}, {
    tableName: 'internal_customers',
    timestamps: false
});

module.exports = InternalCustomer;

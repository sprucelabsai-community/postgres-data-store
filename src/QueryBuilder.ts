import {
    QueryOptions,
    QuerySortField,
    UniqueIndex,
    normalizeIndex,
} from '@sprucelabs/data-stores'
import { generateIndexName, generateKeyExpressions } from './indexUtils'
import { Query } from './postgres.types'

export default class QueryBuilder {
    private constructor() {}

    public static Builder() {
        return new this()
    }

    public createIndex(
        tableName: string,
        index: UniqueIndex,
        isUnique = false
    ): BuiltQuery {
        const { fields, filter } = normalizeIndex(index)
        const indexName = generateIndexName(tableName, index)
        const keys = generateKeyExpressions(fields)

        let query = `CREATE ${
            isUnique ? `UNIQUE` : ''
        } INDEX ${indexName} ON "${tableName}" (${keys})`

        if (filter) {
            const { sql: where } = this.optionallyBuildWhere(filter)
            query += where
        }

        return { sql: query, values: [] }
    }

    public find(
        tableName: string,
        query: Query,
        options?: QueryOptions
    ): BuiltQuery {
        const { includeFields, limit, skip, sort } = options ?? {}
        const fields = this.buildColumnListFromIncludeFields(includeFields)

        let sql = `SELECT ${fields} FROM ${this.buildTableName(tableName)}`

        const { values, sql: where } = this.optionallyBuildWhere(query)
        sql += where

        sql += this.optionallyBuildSkip(skip)
        sql += this.optionallyBuildSort(sort)
        sql += this.optionallyBuildLimit(limit)

        this.log('find', sql, values)

        return { sql, values }
    }

    public buildTableName(tableName: string) {
        return `${this.conditionalQuote(tableName)}`
    }

    private conditionalQuote(fieldName: string) {
        return this.shouldQuote ? quote(fieldName) : fieldName
    }

    private get shouldQuote() {
        return process.env.POSTGRES_SHOULD_QUOTE_FIELD_NAMES === 'true'
    }

    private optionallyBuildWhere(
        query: Record<string, any>,
        startingPlaceholderCount = 0
    ) {
        let sql = ''
        const values: unknown[] = []
        const queryKeys = Object.keys(query)

        if ((queryKeys ?? []).length > 0) {
            const { set: columnSpecs, values: whereValues } =
                this.buildEqualityClause({
                    query,
                    startingCount: startingPlaceholderCount,
                    isBuildingWhere: true,
                })
            sql += ` WHERE ${columnSpecs.join(' AND ')}`
            values.push(...whereValues)
        }
        return { values, sql }
    }

    private buildEqualityClause(options: {
        query: Query
        startingCount?: number
        placeholderTemplate?: string
        isBuildingWhere?: boolean
        useIsNull?: boolean
    }): {
        set: string[]
        values: any[]
    } {
        const {
            query,
            startingCount = 0,
            placeholderTemplate = '${{count}}',
            isBuildingWhere = false,
            useIsNull = true,
        } = options

        let placeholderCount = startingCount
        const queryKeys = Object.keys(query)
        const values: unknown[] = []
        const set: string[] = []

        queryKeys.forEach((k) => {
            let value = query[k]
            const isNull = value === null && useIsNull
            const formattedK = this.conditionalQuote(k)

            if (value?.$in) {
                values.push(
                    ...value.$in.map((v: unknown) => this.normalizeValue(v))
                )
                set.push(
                    `${formattedK} IN (${value.$in
                        .map(() => `$${++placeholderCount}`)
                        .join(', ')})`
                )
            } else if (value?.$type === 'string' || value?.$exists) {
                set.push(`${formattedK} IS NOT NULL`)
            } else if (value?.$regex) {
                values.push(this.normalizeValue(value.$regex))
                set.push(`${formattedK} ~* $${++placeholderCount}`)
            } else if (value?.$lte) {
                values.push(this.normalizeValue(value.$lte))
                set.push(`${formattedK} <= $${++placeholderCount}`)
            } else if (value?.$lt) {
                values.push(this.normalizeValue(value.$lt))
                set.push(`${formattedK} < $${++placeholderCount}`)
            } else if (value?.$gte) {
                values.push(this.normalizeValue(value.$gte))
                set.push(`${formattedK} >= $${++placeholderCount}`)
            } else if (value?.$gt) {
                values.push(this.normalizeValue(value.$gt))
                set.push(`${formattedK} > $${++placeholderCount}`)
            } else if (typeof value?.$ne !== 'undefined') {
                const v = value.$ne
                v !== null && values.push(this.normalizeValue(v))
                set.push(
                    `${formattedK} ${
                        v === null ? 'IS NOT NULL' : `!= $${++placeholderCount}`
                    }`
                )
            } else if (k === '$or') {
                const { set: orWheres, values: orValues } =
                    this.buildSetClausFor$Or(value, placeholderCount)
                set.push(`(${orWheres.join(' OR ')})`)
                values.push(...orValues)
            } else if (k === '$push') {
                const sub = this.buildEqualityClause({
                    query: value,
                    startingCount: placeholderCount++,
                    placeholderTemplate: '"{{fieldName}}" || ARRAY[${{count}}]',
                })

                values.push(...sub.values)
                set.push(...sub.set)
            } else if (isNull || value === undefined) {
                set.push(`${formattedK} IS NULL`)
            } else {
                placeholderCount++

                let placeholder = placeholderTemplate
                    .replace(/{{count}}/gm, `${placeholderCount}`)
                    .replace(/{{fieldName}}/gm, k)

                const isDotSearch = k.includes('.')

                if (isDotSearch) {
                    const [field, prop] = k.split('.')
                    if (isBuildingWhere) {
                        k = `${field} ->> '${prop}'`
                        value = `${value}`
                    } else {
                        k = field
                        placeholder = `"${k}" || jsonb_build_object('${prop}', ${placeholder}::text)`
                    }
                }

                values.push(this.normalizeValue(value))
                set.push(`${this.conditionalQuote(k)} = ${placeholder}`)
            }
        })

        return { set, values }
    }

    private buildSetClausFor$Or(value: any, placeholderCount: number) {
        const ors: string[] = []
        const orValues: unknown[] = []

        value.forEach((q: Record<string, any>) => {
            const { set: where, values } = this.buildEqualityClause({
                query: q,
                startingCount: placeholderCount++,
            })
            ors.push(...where)
            orValues.push(...values)
        })
        return { set: ors, values: orValues }
    }

    public create(
        tableName: string,
        records: Record<string, any>[]
    ): BuiltQuery {
        let { sql, values } = this.createWithoutReturning(tableName, records)
        sql += ` RETURNING *`

        this.log('create', sql, values)

        return {
            sql,
            values,
        }
    }

    private log(...args: any[]) {
        if (process.env.POSTGRES_SHOULD_LOG_QUERIES === 'true') {
            for (const arg of args) {
                console.log(JSON.stringify(arg))
            }
        }
    }

    public createWithoutReturning(
        tableName: string,
        records: Record<string, any>[]
    ): BuiltQuery {
        const { fields, placeholders, values } =
            this.splitRecordsIntoFieldsPlaceholdersAndValues(records)

        const sql = `INSERT INTO ${this.buildTableName(tableName)} (${fields
            .map((f) => `${this.conditionalQuote(f)}`)
            .join(', ')}) VALUES ${placeholders.join(', ')}`

        return { sql, values }
    }

    private splitRecordsIntoFieldsPlaceholdersAndValues(
        records: Record<string, any>[]
    ) {
        const fields = this.buildColumnListFromAllRecords(records)
        let placeholderCount = 0
        const values: string[] = []

        const placeholders: string[] = records.map((record) => {
            const placeholders: string[] = []

            fields.forEach((f) => {
                values.push(this.fieldValueToSqlValue(record, f))
                let placeholder = `$${++placeholderCount}`
                if (
                    this.isValueObject(record[f]) &&
                    !Array.isArray(record[f])
                ) {
                    placeholder += `::json`
                }
                placeholders.push(placeholder)
            })
            return `(${placeholders.join(', ')})`
        })
        return { fields, placeholders, values }
    }

    private fieldValueToSqlValue(record: Record<string, any>, f: string): any {
        let value = record[f]
        return this.normalizeValue(value)
    }

    private normalizeValue(value: any) {
        if (value instanceof RegExp) {
            value = value.toString().replace(/\//g, '')
        }
        if (this.isValueObject(value)) {
            if (Array.isArray(value)) {
                //in postgres, an array is notaded like this {1,2,3}
                value = JSON.stringify(value)
                value = `{${value.substring(1, value.length - 1)}}`
            } else {
                value = JSON.stringify(value)
            }
        }

        return value ?? null
    }

    private isValueObject(value: any) {
        return (
            value !== null &&
            (Array.isArray(value) || typeof value === 'object')
        )
    }

    private buildColumnListFromAllRecords(records: Record<string, any>[]) {
        const fields = records.map((r) => Object.keys(r)).flat()
        const uniqueFields = new Set(fields)

        return Array.from(uniqueFields)
    }

    private optionallyBuildSort(sort: QuerySortField[] | undefined) {
        if (sort) {
            const sortSpecs = sort.map(
                (s) =>
                    `${this.conditionalQuote(s.field)} ${s.direction.toUpperCase()}`
            )
            return ` ORDER BY ${sortSpecs.join(', ')}`
        }

        return ''
    }

    private optionallyBuildSkip(limit: number | undefined) {
        if (typeof limit === 'number') {
            return ` OFFSET ${limit}`
        }
        return ''
    }

    private optionallyBuildLimit(limit: number | undefined) {
        if (typeof limit === 'number') {
            return ` LIMIT ${limit}`
        }
        return ''
    }

    private buildColumnListFromIncludeFields(
        includeFields: string[] | undefined
    ) {
        return !includeFields
            ? '*'
            : includeFields.map((f) => quote(f)).join(', ')
    }

    public update(
        tableName: string,
        query: Query,
        updates: Record<string, any>,
        shouldReturnUpdatedRecords = true
    ): { sql: string; values: unknown[] } {
        const { set: set, values } = this.buildEqualityClause({
            query: updates,
            startingCount: 0,
            useIsNull: false,
        })

        let sql = `UPDATE ${this.buildTableName(tableName)} SET ${set.join(', ')}`

        const { sql: where, values: whereValues } = this.optionallyBuildWhere(
            query,
            values.length
        )
        sql += where
        if (shouldReturnUpdatedRecords) {
            sql += ' RETURNING *'
        }

        const results = {
            sql,
            values: [...values, ...whereValues],
        }

        this.log('update', results)

        return results
    }

    public delete(tableName: string, query?: Query) {
        let sql = `DELETE FROM ${this.buildTableName(tableName)}`

        const { values, sql: where } = this.optionallyBuildWhere(query ?? {})
        sql += where

        this.log('delete', sql, values)

        return {
            sql,
            values,
        }
    }

    public upsert(
        tableName: string,
        query: Query,
        updates: Record<string, any>
    ) {
        let { sql, values } = this.createWithoutReturning(tableName, [
            { ...query, ...updates },
        ])

        const { sql: whereSql, values: whereValues } =
            this.optionallyBuildWhere(query, values.length)

        const queryFields = this.buildColumnListFromAllRecords([query])
        const updateFields = this.buildColumnListFromAllRecords([updates])

        sql += ` ON CONFLICT (${queryFields.join(', ')})`
        sql += whereSql
        sql += ` DO UPDATE SET ${updateFields
            .map((f) => `${f} = EXCLUDED.${f}`)
            .join(', ')}`

        sql += ' RETURNING *'

        this.log('upsert', sql, values)

        return {
            sql,
            values: [...values, ...whereValues],
        }
    }
}
export interface BuiltQuery {
    sql: string
    values: unknown[]
}

export function quote(f: string): string {
    return f.includes(' ') ? f : `"${f}"`
}

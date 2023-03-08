import { QueryOptions, QuerySortField } from '@sprucelabs/data-stores'
import { Query } from './postgres.types'

export default class QueryBuilder {
	private constructor() {}

	public static Builder() {
		return new this()
	}

	public find(
		tableName: string,
		query: Query,
		options?: QueryOptions
	): BuiltQuery {
		const { includeFields, limit, skip, sort } = options ?? {}
		const fields = this.buildColumnListFromIncludeFields(includeFields)

		let sql = `SELECT ${fields} FROM public.${tableName}`

		const { values, sql: where } = this.optionallyBuildWhere(query)
		sql += where

		sql += this.optionallyBuildSkip(skip)
		sql += this.optionallyBuildSort(sort)
		sql += this.optionallyBuildLimit(limit)

		return { sql, values }
	}

	private optionallyBuildWhere(
		query: Record<string, any>,
		startingPlaceholderCount = 0
	) {
		let sql = ''
		const values: unknown[] = []
		const queryKeys = Object.keys(query)

		if ((queryKeys ?? []).length > 0) {
			const { set: columnSpecs, values: whereValues } = this.buildSetClause({
				query,
				startingCount: startingPlaceholderCount,
				isBuildingWhere: true,
			})
			sql += ` WHERE ${columnSpecs.join(' AND ')}`
			values.push(...whereValues)
		}
		return { values, sql }
	}

	private buildSetClause(options: {
		query: Query
		startingCount?: number
		placeholderTemplate?: string
		isBuildingWhere?: boolean
	}): {
		set: string[]
		values: any[]
	} {
		const {
			query,
			startingCount = 0,
			placeholderTemplate = '${{count}}',
			isBuildingWhere = false,
		} = options

		let placeholderCount = startingCount
		const queryKeys = Object.keys(query)
		const values: unknown[] = []
		const set: string[] = []

		queryKeys.forEach((k) => {
			let value = query[k]
			if (value?.$in) {
				values.push(...value.$in.map((v: unknown) => this.normalizeValue(v)))
				set.push(
					`${k} IN (${value.$in
						.map(() => `$${++placeholderCount}`)
						.join(', ')})`
				)
			} else if (value?.$regex) {
				values.push(this.normalizeValue(value.$regex))
				set.push(`${k} ~* $${++placeholderCount}`)
			} else if (value?.$lte) {
				values.push(this.normalizeValue(value.$lte))
				set.push(`${k} <= $${++placeholderCount}`)
			} else if (value?.$lt) {
				values.push(this.normalizeValue(value.$lt))
				set.push(`${k} < $${++placeholderCount}`)
			} else if (value?.$gte) {
				values.push(this.normalizeValue(value.$gte))
				set.push(`${k} >= $${++placeholderCount}`)
			} else if (value?.$gt) {
				values.push(this.normalizeValue(value.$gt))
				set.push(`${k} > $${++placeholderCount}`)
			} else if (typeof value?.$ne !== 'undefined') {
				const v = value.$ne
				v !== null && values.push(this.normalizeValue(v))
				set.push(
					`${k} ${v === null ? 'IS NOT NULL' : `!= $${++placeholderCount}`}`
				)
			} else if (k === '$or') {
				const { set: orWheres, values: orValues } = this.buildSetClausFor$Or(
					value,
					placeholderCount
				)
				set.push(`(${orWheres.join(' OR ')})`)
				values.push(...orValues)
			} else if (k === '$push') {
				const sub = this.buildSetClause({
					query: value,
					startingCount: placeholderCount++,
					placeholderTemplate: `JSONB_SET(COALESCE(names || \${{count}}::JSONB, '[]'::JSONB), '{-1}', \${{count}}::JSONB)`,
				})

				values.push(...sub.values.map((v) => JSON.stringify(v)))
				set.push(...sub.set)
			} else if (value === null || value === undefined) {
				set.push(`${k} IS NULL`)
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
						placeholder = `${k} || jsonb_build_object('${prop}', ${placeholder}::text)`
					}
				}

				values.push(this.normalizeValue(value))
				set.push(`${k} = ${placeholder}`)
			}
		})

		return { set, values }
	}

	private buildSetClausFor$Or(value: any, placeholderCount: number) {
		const ors: string[] = []
		const orValues: unknown[] = []

		value.forEach((q: Record<string, any>) => {
			const { set: where, values } = this.buildSetClause({
				query: q,
				startingCount: placeholderCount++,
			})
			ors.push(...where)
			orValues.push(...values)
		})
		return { set: ors, values: orValues }
	}

	public create(tableName: string, records: Record<string, any>[]): BuiltQuery {
		let { sql, values } = this.createWithoutReturning(tableName, records)
		sql += ` RETURNING *`

		return {
			sql,
			values,
		}
	}

	public createWithoutReturning(
		tableName: string,
		records: Record<string, any>[]
	): BuiltQuery {
		const { fields, placeholders, values } =
			this.splitRecordsIntoFieldsPlaceholdersAndValues(records)

		const sql = `INSERT INTO public.${tableName} (${fields.join(
			', '
		)}) VALUES ${placeholders.join(', ')}`

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
				if (this.isValueObject(record[f])) {
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
			value = JSON.stringify(value)
		}

		return value ?? null
	}

	private isValueObject(value: any) {
		return value !== null && (Array.isArray(value) || typeof value === 'object')
	}

	private buildColumnListFromAllRecords(records: Record<string, any>[]) {
		const fields = records.map((r) => Object.keys(r)).flat()
		const uniqueFields = new Set(fields)
		return Array.from(uniqueFields)
	}

	private optionallyBuildSort(sort: QuerySortField[] | undefined) {
		if (sort) {
			const sortSpecs = sort.map(
				(s) => `${s.field} ${s.direction.toUpperCase()}`
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
		return !includeFields ? '*' : includeFields.join(', ')
	}

	public update(
		tableName: string,
		query: Query,
		updates: Record<string, any>,
		shouldReturnUpdatedRecords = true
	): { sql: string; values: unknown[] } {
		const { set: set, values } = this.buildSetClause({
			query: updates,
			startingCount: 0,
		})

		let sql = `UPDATE public.${tableName} SET ${set.join(', ')}`

		const { sql: where, values: whereValues } = this.optionallyBuildWhere(
			query,
			values.length
		)
		sql += where
		if (shouldReturnUpdatedRecords) {
			sql += ' RETURNING *'
		}

		return {
			sql,
			values: [...values, ...whereValues],
		}
	}

	public delete(tableName: string, query?: Query) {
		let sql = `DELETE FROM public.${tableName}`

		const { values, sql: where } = this.optionallyBuildWhere(query ?? {})
		sql += where

		return {
			sql,
			values,
		}
	}

	public upsert(tableName: string, query: Query, updates: Record<string, any>) {
		let { sql, values } = this.createWithoutReturning(tableName, [
			{ ...query, ...updates },
		])

		const { sql: whereSql, values: whereValues } = this.optionallyBuildWhere(
			query,
			values.length
		)

		const queryFields = this.buildColumnListFromAllRecords([query])
		const updateFields = this.buildColumnListFromAllRecords([updates])

		sql += ` ON CONFLICT (${queryFields.join(', ')})`
		sql += whereSql
		sql += ` DO UPDATE SET ${updateFields
			.map((f) => `${f} = EXCLUDED.${f}`)
			.join(', ')}`

		sql += ' RETURNING *'

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

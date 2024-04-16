import { test, assert } from '@sprucelabs/test-utils'
import AbstractSpruceTest from '@sprucelabs/test-utils'
import QueryBuilder from '../../QueryBuilder'

export default class RemovingQuotesFromSqlStatementsTest extends AbstractSpruceTest {
    private static query: QueryBuilder
    protected static async beforeEach() {
        await super.beforeEach()
        delete process.env.POSTGRES_SHOULD_QUOTE_FIELD_NAMES
        this.query = QueryBuilder.Builder()
    }
    @test()
    protected static async canDisableQuotesFromCreate() {
        const { sql } = this.query.create('test', [{ name: 'test' }])
        assert.isEqual(sql, 'INSERT INTO test (name) VALUES ($1) RETURNING *')
    }

    @test()
    protected static async canDisableQuotesFromFind() {
        const { sql } = this.query.find('test', { id: '123' })
        assert.isEqual(sql, 'SELECT * FROM test WHERE id = $1')
    }

    @test()
    protected static async canDisableQuotesFromSortedFind() {
        const { sql } = this.query.find(
            'test',
            { id: '123' },
            {
                sort: [
                    { direction: 'asc', field: 'firstName' },
                    { direction: 'desc', field: 'lastName' },
                ],
            }
        )
        assert.isEqual(
            sql,
            `SELECT * FROM test WHERE id = $1 ORDER BY firstName ASC, lastName DESC`
        )
    }

    @test(
        'can disable quotes from find with $gt',
        { age: { $gt: 3 } },
        'SELECT * FROM test WHERE age > $1'
    )
    @test(
        'can disable quotes from find with $gte',
        { age: { $gte: 3 } },
        'SELECT * FROM test WHERE age >= $1'
    )
    @test(
        'can disable quotes from find with $lt',
        { age: { $lt: 3 } },
        'SELECT * FROM test WHERE age < $1'
    )
    @test(
        'can disable quotes from find with $lte',
        { age: { $lte: 3 } },
        'SELECT * FROM test WHERE age <= $1'
    )
    @test(
        'can disable quotes from find with $ne',
        { age: { $ne: 3 } },
        'SELECT * FROM test WHERE age != $1'
    )
    @test(
        'can disable quotes from find with $in',
        { age: { $in: [3, 4] } },
        'SELECT * FROM test WHERE age IN ($1, $2)'
    )
    @test(
        'can disable quotes from find with $regex',
        { name: { $regex: 'test' } },
        'SELECT * FROM test WHERE name ~* $1'
    )
    @test(
        'can disable quotes from find with $or',
        { $or: [{ age: 3 }, { age: 4 }] },
        'SELECT * FROM test WHERE (age = $1 OR age = $2)'
    )
    @test(
        'can disable quotes from find with NULL value',
        { age: null },
        'SELECT * FROM test WHERE age IS NULL'
    )
    protected static async canDisableQuotesFromFindWithAdvancedQuery(
        query: Record<string, any>,
        expected: string
    ) {
        const { sql } = this.query.find('test', query)
        assert.isEqual(sql, expected)
    }

    @test()
    protected static async canDisableQuotesFromUpdate() {
        const { sql } = this.query.update(
            'test',
            { id: '123' },
            { name: 'test' }
        )
        assert.isEqual(
            sql,
            'UPDATE test SET name = $1 WHERE id = $2 RETURNING *'
        )
    }

    @test()
    protected static async canDisableQuotesFromDelete() {
        const { sql } = this.query.delete('test', { id: '123' })
        assert.isEqual(sql, 'DELETE FROM test WHERE id = $1')
    }
}

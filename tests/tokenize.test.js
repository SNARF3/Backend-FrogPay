/**
 * Tests para la HU de Tokenización de Tarjetas
 *
 * Criterios de aceptación:
 * ✓ POST /api/cards/tokenize recibe card_number, expiry, cvv → devuelve card_token
 * ✓ Validación: 16 dígitos, CVV 3-4, expiración no vencida → 400 con mensaje específico
 * ✓ Token en Redis con TTL 15 min, se elimina al usarse (un solo uso)
 * ✓ Datos sensibles no en BD ni logs — solo el token vive en Redis
 * ✓ Token expirado/usado → 400 "Token inválido o expirado"
 */

const { validateCardData } = require('../src/modules/cards/card.validator');
const cardService = require('../src/modules/cards/card.service');
const { connection: redis } = require('../src/config/redis');

// ========================================
// TESTS DE VALIDACIÓN (card.validator)
// ========================================

async function testValidaciones() {
	console.log('\n========== TESTS DE VALIDACIÓN ==========\n');

	// Test 1: Datos válidos → null (sin error)
	const t1 = validateCardData({ card_number: '4111111111111111', cvv: '123', expiry: '12/28' });
	console.log(t1 === null ? '✅' : '❌', 'Test 1 — Datos válidos retorna null:', t1);

	// Test 2: card_number con menos de 16 dígitos → error
	const t2 = validateCardData({ card_number: '411111111111111', cvv: '123', expiry: '12/28' });
	console.log(t2 && t2.field === 'card_number' ? '✅' : '❌', 'Test 2 — 15 dígitos rechazado:', t2?.message);

	// Test 3: card_number con más de 16 dígitos → error
	const t3 = validateCardData({ card_number: '41111111111111112', cvv: '123', expiry: '12/28' });
	console.log(t3 && t3.field === 'card_number' ? '✅' : '❌', 'Test 3 — 17 dígitos rechazado:', t3?.message);

	// Test 4: CVV de 2 dígitos → error
	const t4 = validateCardData({ card_number: '4111111111111111', cvv: '12', expiry: '12/28' });
	console.log(t4 && t4.field === 'cvv' ? '✅' : '❌', 'Test 4 — CVV 2 dígitos rechazado:', t4?.message);

	// Test 5: CVV de 3 dígitos → válido
	const t5 = validateCardData({ card_number: '4111111111111111', cvv: '123', expiry: '12/28' });
	console.log(t5 === null ? '✅' : '❌', 'Test 5 — CVV 3 dígitos válido');

	// Test 6: CVV de 4 dígitos → válido (AMEX)
	const t6 = validateCardData({ card_number: '4111111111111111', cvv: '1234', expiry: '12/28' });
	console.log(t6 === null ? '✅' : '❌', 'Test 6 — CVV 4 dígitos válido');

	// Test 7: CVV de 5 dígitos → error
	const t7 = validateCardData({ card_number: '4111111111111111', cvv: '12345', expiry: '12/28' });
	console.log(t7 && t7.field === 'cvv' ? '✅' : '❌', 'Test 7 — CVV 5 dígitos rechazado:', t7?.message);

	// Test 8: Expiración vencida → error
	const t8 = validateCardData({ card_number: '4111111111111111', cvv: '123', expiry: '01/23' });
	console.log(t8 && t8.field === 'expiry' ? '✅' : '❌', 'Test 8 — Tarjeta vencida rechazada:', t8?.message);

	// Test 9: Expiración futura → válida
	const t9 = validateCardData({ card_number: '4111111111111111', cvv: '123', expiry: '12/30' });
	console.log(t9 === null ? '✅' : '❌', 'Test 9 — Expiración futura válida');

	// Test 10: Formato de expiración inválido → error
	const t10 = validateCardData({ card_number: '4111111111111111', cvv: '123', expiry: '2028-12' });
	console.log(t10 && t10.field === 'expiry' ? '✅' : '❌', 'Test 10 — Formato inválido rechazado:', t10?.message);

	// Test 11: Campo faltante → error
	const t11 = validateCardData({ card_number: '4111111111111111', expiry: '12/28' });
	console.log(t11 && t11.field === 'cvv' ? '✅' : '❌', 'Test 11 — CVV faltante detectado:', t11?.message);

	// Test 12: card_number con letras → error
	const t12 = validateCardData({ card_number: '4111abcd11111111', cvv: '123', expiry: '12/28' });
	console.log(t12 && t12.field === 'card_number' ? '✅' : '❌', 'Test 12 — Letras en card_number rechazado:', t12?.message);
}

// ========================================
// TESTS DE REDIS (card.service)
// ========================================

async function testRedisTokenFlow() {
	console.log('\n========== TESTS DE REDIS (TOKEN FLOW) ==========\n');

	try {
		// Test 13: Crear token → retorna tok_xxx
		const token = await cardService.createToken({
			cardNumber: '4111111111111111',
			expiry: '12/28',
			empresaId: 'test-empresa-123',
		});
		console.log(token.startsWith('tok_') ? '✅' : '❌', 'Test 13 — Token generado con prefijo tok_:', token);

		// Test 14: Token existe en Redis con TTL
		const ttl = await redis.ttl(`card_token:${token}`);
		console.log(ttl > 0 && ttl <= 900 ? '✅' : '❌', `Test 14 — TTL en Redis: ${ttl}s (esperado <= 900)`);

		// Test 15: Consumir token → retorna datos
		const data = await cardService.consumeToken(token);
		console.log(data && data.last4 === '1111' ? '✅' : '❌', 'Test 15 — Token consumido, last4:', data?.last4);

		// Test 16: Segundo consumo del mismo token → null (un solo uso)
		const data2 = await cardService.consumeToken(token);
		console.log(data2 === null ? '✅' : '❌', 'Test 16 — Segundo uso retorna null (un solo uso):', data2);

		// Test 17: Token inexistente → null
		const data3 = await cardService.consumeToken('tok_noexiste123');
		console.log(data3 === null ? '✅' : '❌', 'Test 17 — Token inexistente retorna null:', data3);

		// Test 18: Datos sensibles NO almacenados en Redis
		const token2 = await cardService.createToken({
			cardNumber: '5200828282828210',
			expiry: '06/29',
			empresaId: 'test-empresa-456',
		});
		const raw = await redis.get(`card_token:${token2}`);
		const parsed = JSON.parse(raw);
		const hasFull = raw.includes('5200828282828210');
		console.log(!hasFull ? '✅' : '❌', 'Test 18 — Número completo NO en Redis');
		console.log(parsed.last4 === '8210' ? '✅' : '❌', 'Test 18b — Solo last4 almacenado:', parsed.last4);

		// Limpiar token de prueba
		await redis.del(`card_token:${token2}`);

	} catch (error) {
		console.error('❌ Error en tests de Redis:', error.message);
		console.error('   ¿Redis está corriendo? Verifica con: redis-cli ping');
	}
}

// ========================================
// EJECUTAR TESTS
// ========================================

async function runAllTests() {
	console.log('🐸 FrogPay — Tests HU Tokenización de Tarjetas');
	console.log('===============================================');

	await testValidaciones();
	await testRedisTokenFlow();

	console.log('\n===============================================');
	console.log('Tests completados. Cerrando conexión Redis...');

	await redis.quit();
	process.exit(0);
}

runAllTests().catch((err) => {
	console.error('Error fatal:', err);
	process.exit(1);
});

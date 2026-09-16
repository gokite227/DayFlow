package com.dayflow.api.auth;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface ExchangeCodeRepository extends JpaRepository<ExchangeCode, UUID> {

    /** Row lock: a code exchanged twice at the same moment is still used only once. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<ExchangeCode> findByCodeHash(String codeHash);
}

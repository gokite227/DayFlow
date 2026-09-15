package com.dayflow.api.recovery;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RecoveryEventRepository extends JpaRepository<RecoveryEvent, UUID> {
}

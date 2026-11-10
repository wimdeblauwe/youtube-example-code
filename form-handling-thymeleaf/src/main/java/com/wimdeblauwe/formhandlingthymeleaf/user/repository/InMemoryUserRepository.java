package com.wimdeblauwe.formhandlingthymeleaf.user.repository;

import com.wimdeblauwe.formhandlingthymeleaf.user.User;
import org.springframework.stereotype.Repository;

import java.util.*;

@Repository
public class InMemoryUserRepository implements UserRepository {
    private final Map<UUID, User> users = new HashMap<>();

    @Override
    public void save(User user) {
        users.put(user.getId(), user);
    }

    @Override
    public List<User> findAll() {
        return new ArrayList<>(users.values());
    }
}

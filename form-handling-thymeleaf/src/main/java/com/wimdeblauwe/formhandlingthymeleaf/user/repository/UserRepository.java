package com.wimdeblauwe.formhandlingthymeleaf.user.repository;


import com.wimdeblauwe.formhandlingthymeleaf.user.User;

import java.util.List;

public interface UserRepository {
    void save(User user);

    List<User> findAll();
}
